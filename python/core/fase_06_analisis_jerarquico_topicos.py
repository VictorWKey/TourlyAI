"""
Fase 06: Análisis Jerárquico de Tópicos
========================================
Identifica sub-tópicos dentro de cada categoría usando BERTopic.
Añade la columna 'Topico' al dataset con el sub-tópico identificado.
"""

import logging
import os
import re
import warnings
from collections import Counter

import nltk
import numpy as np
import pandas as pd
from bertopic import BERTopic
from hdbscan import HDBSCAN
from nltk.corpus import stopwords
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import CountVectorizer
from tqdm import tqdm
from umap import UMAP

from config.config import ConfigDataset

# Importar proveedor de LLM unificado y utilidades robustas
from .llm_provider import LLMRetryExhaustedError, crear_chain_robusto
from .llm_utils import LLMQuotaExhaustedError

os.environ['TOKENIZERS_PARALLELISM'] = 'false'
warnings.filterwarnings('ignore')

# Configurar logging
logger = logging.getLogger(__name__)


class TopicLabel(BaseModel):
    topic_id: int = Field(..., description='ID del tópico')
    label: str = Field(..., description='Etiqueta descriptiva para el tópico')


class TopicsOutput(BaseModel):
    topics: list[TopicLabel] = Field(..., description='Lista de tópicos con sus etiquetas')


class AnalizadorJerarquicoTopicos:
    """
    Analiza sub-tópicos dentro de categorías usando BERTopic.
    Añade columna 'Topico' al dataset con un DICCIONARIO {categoria: nombre_topico}.

    Dado que cada reseña puede tener múltiples categorías, cada reseña puede tener
    múltiples tópicos (uno por cada categoría a la que pertenece).

    Ejemplo:
        Categorias: ['Transporte', 'Personal y servicio']
        Topico: {'Transporte': 'Servicio de ferry', 'Personal y servicio': 'Atención al cliente'}
    """

    def __init__(self):
        self.dataset_path = str(ConfigDataset.get_dataset_path())

        # Determinar mínimo adaptativo basado en tamaño del dataset
        try:
            df_temp = pd.read_csv(self.dataset_path)
            dataset_size = len(df_temp)

            # Ajustar min_opiniones según el tamaño del dataset:
            # - Datasets pequeños (<100): min 10 opiniones por categoría
            # - Datasets medianos (100-500): min 30 opiniones
            # - Datasets grandes (>500): min 50 opiniones
            if dataset_size < 100:
                self.min_opiniones_categoria = max(5, dataset_size // 10)
            elif dataset_size < 500:
                self.min_opiniones_categoria = 30
            else:
                self.min_opiniones_categoria = 50

            print(
                f'   ℹ️  Umbral mínimo por categoría: {self.min_opiniones_categoria} opiniones (dataset: {dataset_size} filas)'
            )
        except Exception:
            # Fallback conservador
            self.min_opiniones_categoria = 10

        # Descargar stopwords si no están disponibles
        try:
            stopwords.words('spanish')
        except Exception:
            nltk.download('stopwords', quiet=True)

        # Cache: embedding model loaded once and reused across all categories
        cache_dir = ConfigDataset.get_models_cache_dir()
        self._embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2', cache_folder=cache_dir)
        # Pre-computed embeddings (populated at the start of procesar())
        self._all_embeddings = None
        self._all_texts = None
        self._text_to_idx = None

    def _get_precomputed_embeddings(self, textos: list[str]) -> np.ndarray:
        """
        Retrieve pre-computed embeddings for a list of texts.
        Falls back to computing on-the-fly for any text not in the cache.

        Args:
            textos: List of texts to get embeddings for

        Returns:
            numpy array of shape (len(textos), embedding_dim)
        """
        if self._text_to_idx is None or self._all_embeddings is None:
            # Fallback: compute embeddings directly if pre-computation wasn't done
            return self._embedding_model.encode(textos, show_progress_bar=False)

        indices = []
        missing_texts = []
        missing_positions = []

        for i, text in enumerate(textos):
            idx = self._text_to_idx.get(text)
            if idx is not None:
                indices.append((i, idx))
            else:
                missing_texts.append(text)
                missing_positions.append(i)

        # Build result array
        embedding_dim = self._all_embeddings.shape[1]
        result = np.empty((len(textos), embedding_dim), dtype=self._all_embeddings.dtype)

        # Fill from pre-computed cache
        for pos, idx in indices:
            result[pos] = self._all_embeddings[idx]

        # Compute any missing embeddings on-the-fly (safety net)
        if missing_texts:
            missing_emb = self._embedding_model.encode(missing_texts, show_progress_bar=False)
            for pos, emb in zip(missing_positions, missing_emb):
                result[pos] = emb

        return result

    def _analizar_caracteristicas(self, textos: list[str]) -> dict:
        """Analiza características básicas de los textos."""
        textos_validos = [t for t in textos if t and str(t).strip()]

        if not textos_validos:
            return {}

        # Características básicas
        caracteristicas = {
            'num_textos': len(textos_validos),
            'palabras_promedio': np.mean([len(t.split()) for t in textos_validos]),
            'homogeneidad': self._calcular_homogeneidad(textos_validos),
            'diversidad_lexica': self._calcular_diversidad_lexica(textos_validos),
            'densidad_semantica': self._calcular_densidad_semantica(textos_validos),
        }

        return caracteristicas

    def _calcular_homogeneidad(self, textos: list[str]) -> float:
        """Calcula homogeneidad basada en variabilidad de longitudes."""
        if len(textos) < 2:
            return 1.0

        longitudes = [len(t.split()) for t in textos]
        cv_longitud = np.std(longitudes) / np.mean(longitudes) if np.mean(longitudes) > 0 else 0
        homogeneidad = 1 / (1 + cv_longitud)

        return float(min(homogeneidad, 1.0))

    def _calcular_diversidad_lexica(self, textos: list[str]) -> float:
        """Calcula diversidad léxica (ratio palabras únicas / total)."""
        todas_palabras = []
        for texto in textos:
            palabras = texto.lower().split()
            todas_palabras.extend(palabras)

        if not todas_palabras:
            return 0.0

        palabras_unicas = set(todas_palabras)
        return len(palabras_unicas) / len(todas_palabras)

    def _calcular_densidad_semantica(self, textos: list[str]) -> float:
        """Estima densidad semántica basada en repetición de palabras clave."""
        palabras_significativas = []
        for texto in textos:
            palabras = [
                p.lower() for p in texto.split() if len(p) > 3 and not p.isdigit() and not re.match(r'^\W+$', p)
            ]
            palabras_significativas.extend(palabras)

        if not palabras_significativas:
            return 0.0

        contador = Counter(palabras_significativas)
        palabras_frecuentes = [palabra for palabra, freq in contador.items() if freq > 1]

        return len(palabras_frecuentes) / len(set(palabras_significativas))

    def _optimizar_umap(self, caracteristicas: dict) -> dict:
        """Optimiza parámetros de UMAP."""
        num_textos = caracteristicas['num_textos']
        homogeneidad = caracteristicas['homogeneidad']
        diversidad = caracteristicas['diversidad_lexica']

        # n_neighbors - AJUSTADO para datasets pequeños
        if num_textos < 15:
            # Para datasets muy pequeños, usar menos vecinos
            n_neighbors = max(2, min(5, num_textos - 1))
        elif num_textos < 50:
            n_neighbors = max(5, min(10, num_textos // 3))
        elif num_textos < 200:
            n_neighbors = 15 + int(homogeneidad * 8)
        else:
            n_neighbors = 10 + int(homogeneidad * 10)

        # n_components - AJUSTADO para datasets pequeños
        if num_textos < 20:
            # Para datasets muy pequeños, reducir dimensionalidad
            n_components = min(5, max(2, num_textos // 5))
        elif num_textos < 100:
            n_components = min(15, max(5, num_textos // 6))
        elif diversidad > 0.7:
            n_components = min(40, max(15, num_textos // 6))
        elif diversidad > 0.4:
            n_components = 30
        else:
            n_components = 15

        # min_dist
        densidad = caracteristicas['densidad_semantica']
        min_dist = max(0.0, 0.01 - (densidad * 0.01))

        return {
            'n_neighbors': n_neighbors,
            'n_components': n_components,
            'min_dist': min_dist,
            'metric': 'cosine',
            'random_state': 42,
        }

    def _optimizar_hdbscan(self, caracteristicas: dict) -> dict:
        """Optimiza parámetros de HDBSCAN."""
        num_textos = caracteristicas['num_textos']
        homogeneidad = caracteristicas['homogeneidad']
        diversidad = caracteristicas['diversidad_lexica']

        # min_cluster_size - AJUSTADO para datasets pequeños y grandes
        if num_textos < 20:
            # Datasets muy pequeños: permitir clusters muy pequeños
            min_cluster_size = max(2, int(num_textos * 0.15))
        elif num_textos < 50:
            # Datasets pequeños: clusters más pequeños pero razonables
            min_cluster_size = max(3, int(num_textos * 0.10))
        elif num_textos < 200:
            min_cluster_size = max(5, int(num_textos * 0.06))
        elif num_textos < 500:
            min_cluster_size = max(8, int(num_textos * 0.03))
        else:
            min_cluster_size = max(10, int(num_textos * 0.025))

        # Ajustar por homogeneidad - MENOS AGRESIVO
        if homogeneidad > 0.8:
            min_cluster_size = int(min_cluster_size * 1.2)
        elif homogeneidad < 0.5:
            min_cluster_size = int(min_cluster_size * 0.85)

        # cluster_selection_epsilon - REDUCIDO para permitir más sub-división
        if diversidad > 0.6:
            epsilon = 0.05
        elif diversidad > 0.4:
            epsilon = 0.03
        else:
            epsilon = 0.0

        return {
            'min_cluster_size': max(2, min_cluster_size),  # Mínimo reducido a 2 para datasets pequeños
            'metric': 'euclidean',
            'cluster_selection_method': 'eom',  # CAMBIADO: genera más tópicos granulares
            'prediction_data': True,
            'cluster_selection_epsilon': epsilon,
        }

    def _optimizar_vectorizer(self, caracteristicas: dict) -> dict:
        """Optimiza parámetros del vectorizador con validación robusta."""
        num_textos = caracteristicas['num_textos']
        palabras_promedio = caracteristicas['palabras_promedio']
        diversidad = caracteristicas['diversidad_lexica']

        # ngram_range
        if palabras_promedio > 15:
            ngram_range = (1, 3)
        elif palabras_promedio > 8:
            ngram_range = (1, 2)
        else:
            ngram_range = (1, 1)

        # min_df - usar conteos absolutos para datasets muy pequeños
        if num_textos < 20:
            min_df = 1  # Muy permisivo para datasets muy pequeños
        else:
            min_df = 1

        # max_df - CRÍTICO: ajustar según tamaño del dataset
        # Para datasets pequeños, usar conteos absolutos en lugar de porcentajes
        if num_textos < 10:
            # Datasets muy pequeños: no filtrar por frecuencia máxima
            max_df = 1.0
        elif num_textos < 30:
            # Datasets pequeños: permitir términos muy comunes
            max_df = max(0.99, 1.0 - 1 / num_textos)  # Excluir solo si aparece en TODOS
        elif num_textos < 100:
            # Usar conteo absoluto: excluir términos en más de 90% de documentos
            max_df = int(num_textos * 0.9)
        else:
            # Datasets grandes: usar porcentajes
            if diversidad > 0.7:
                max_df = 0.95
            elif diversidad > 0.4:
                max_df = 0.98
            else:
                max_df = 0.99

        # VALIDACIÓN: Asegurar compatibilidad entre min_df y max_df
        # Cuando max_df es entero, debe ser mayor que min_df
        if isinstance(max_df, int) and max_df <= min_df:
            max_df = min(num_textos, min_df + 2)

        # max_features
        if num_textos < 10:
            max_features = None  # Sin límite para datasets muy pequeños
        elif num_textos < 100:
            max_features = 250
        elif num_textos < 500:
            max_features = 350
        else:
            max_features = min(500, num_textos)

        # Stopwords - reducir para datasets pequeños
        if num_textos < 20:
            # Solo español para datasets muy pequeños
            stopwords_multilingues = set(stopwords.words('spanish'))
        else:
            # Multilingües para datasets más grandes
            idiomas = ['spanish', 'english', 'portuguese', 'french', 'italian']
            stopwords_multilingues = set()
            for idioma in idiomas:
                stopwords_multilingues.update(stopwords.words(idioma))

        return {
            'ngram_range': ngram_range,
            'stop_words': list(stopwords_multilingues),
            'min_df': min_df,
            'max_df': max_df,
            'max_features': max_features,
        }

    def _crear_bertopic(self, textos: list[str]) -> BERTopic:
        """Crea modelo BERTopic optimizado para los textos."""
        # Analizar características
        caracteristicas = self._analizar_caracteristicas(textos)

        # Optimizar hiperparámetros
        umap_params = self._optimizar_umap(caracteristicas)
        hdbscan_params = self._optimizar_hdbscan(caracteristicas)
        vectorizer_params = self._optimizar_vectorizer(caracteristicas)

        # Crear componentes (reuse cached embedding model)
        umap_model = UMAP(**umap_params)
        hdbscan_model = HDBSCAN(**hdbscan_params)
        vectorizer_model = CountVectorizer(**vectorizer_params)

        # Crear modelo BERTopic
        # calculate_probabilities=False: probabilities are not used downstream,
        # disabling saves significant HDBSCAN computation time per category
        topic_model = BERTopic(
            embedding_model=self._embedding_model,
            umap_model=umap_model,
            hdbscan_model=hdbscan_model,
            vectorizer_model=vectorizer_model,
            language='multilingual',
            calculate_probabilities=False,
            verbose=False,
        )

        return topic_model

    def _crear_bertopic_fallback(self, textos: list[str]) -> BERTopic:
        """
        Crea modelo BERTopic con configuración minimalista para casos extremos.
        Usado como fallback cuando la configuración optimizada falla.
        """
        num_textos = len(textos)

        # UMAP: parámetros mínimos
        umap_model = UMAP(
            n_neighbors=max(2, min(5, num_textos - 1)),
            n_components=min(2, num_textos - 1),
            min_dist=0.0,
            metric='cosine',
            random_state=42,
        )

        # HDBSCAN: muy permisivo
        hdbscan_model = HDBSCAN(
            min_cluster_size=2, metric='euclidean', cluster_selection_method='eom', prediction_data=True
        )

        # CountVectorizer: configuración minimal
        vectorizer_model = CountVectorizer(
            ngram_range=(1, 1),
            stop_words=list(stopwords.words('spanish')),  # Solo español
            min_df=1,
            max_df=1.0,  # No filtrar por frecuencia máxima
            max_features=None,  # Sin límite
        )

        # Crear modelo BERTopic (reuse cached embedding model)
        topic_model = BERTopic(
            embedding_model=self._embedding_model,
            umap_model=umap_model,
            hdbscan_model=hdbscan_model,
            vectorizer_model=vectorizer_model,
            language='multilingual',
            calculate_probabilities=False,
            verbose=False,
        )

        return topic_model

    def _configurar_clasificador_llm(self, categoria_padre: str):
        """Configura el clasificador LLM para etiquetar tópicos."""
        contexto_categoria = f"""
CONTEXTO IMPORTANTE:
Estás analizando sub-tópicos DENTRO de la categoría "{categoria_padre}".
Todos los nombres deben ser SUB-CATEGORÍAS específicas de "{categoria_padre}", NO categorías generales.
"""

        ejemplos_por_categoria = {
            'Gastronomía': 'restaurantes temáticos, comida callejera, mariscos frescos, cocina internacional',
            'Naturaleza': 'cenotes y grutas, áreas de snorkel, reservas ecológicas, avistamiento de fauna',
            'Transporte': 'transporte marítimo, tours en vehículo, acceso peatonal, estacionamiento',
            'Personal y servicio': 'atención al cliente, guías turísticos, limpieza y mantenimiento, seguridad del personal',
            'Fauna y vida animal': 'nado con delfines, observación de aves, tortugas marinas, acuarios y exhibiciones',
            'Historia y cultura': 'ruinas arqueológicas, museos temáticos, sitios coloniales, arquitectura histórica',
            'Compras': 'artesanías locales, mercados tradicionales, joyería y plata, souvenirs temáticos',
            'Deportes y aventura': 'buceo y snorkel, tirolesas y rappel, kayak y paddle, escalada',
            'Vida nocturna': 'bares y cantinas, discotecas, shows nocturnos, terrazas y lounges',
            'Alojamiento': 'resorts todo incluido, hoteles boutique, hostales económicos, ubicación estratégica',
            'Eventos y festivales': 'festivales culturales, eventos deportivos, celebraciones tradicionales, espectáculos temáticos',
            'Seguridad': 'vigilancia y control, medidas sanitarias, salvavidas, iluminación nocturna',
        }
        ejemplos = ejemplos_por_categoria.get(
            categoria_padre, 'actividades específicas, instalaciones, servicios particulares'
        )

        # Determine output language from environment variable
        analysis_language = os.environ.get('ANALYSIS_LANGUAGE', 'es')

        if analysis_language == 'en':
            language_rule = '1. Names in ENGLISH'
            generic_bad = 'Too generic (tourism, attraction, place, experience)'
            prompt_template = (
                """
You are an expert in tourism opinion analysis and topic taxonomy.

"""
                + contexto_categoria
                + """

Analyze the following topics identified by BERTopic with their keywords:

{topics_info}

Your task: Assign a unique descriptive name to each topic based on the keywords.

MANDATORY RULES:
"""
                + language_rule
                + """
2. Maximum 4 words per name
3. CONCRETE and DESCRIPTIVE names based on the keywords shown
4. The name MUST have SEMANTIC COHERENCE - words must relate logically
5. DO NOT combine unrelated concepts
6. If keywords mix themes, identify the most coherent DOMINANT theme
7. Avoid opinion adjectives (beautiful, amazing, excellent)
8. DO NOT use specific place names
9. DO NOT use brand names
10. ALL names must be UNIQUE - no duplicates
11. If two topics are similar, differentiate by specific nuance

SPECIFICITY LEVEL:
- ✅ CORRECT: """
                + ejemplos
                + """
- ❌ INCORRECT: """
                + generic_bad
                + """

IMPORTANT - JSON FORMAT:
1. Respond ONLY with valid JSON, no additional text
2. Use "topics" as the main field
3. Use "topic_id" and "label" for each topic

{format_instructions}
"""
            )
        else:
            prompt_template = (
                """
Eres un experto en análisis de opiniones turísticas y taxonomía de tópicos.

"""
                + contexto_categoria
                + """

Analiza los siguientes tópicos identificados por BERTopic con sus palabras clave:

{topics_info}

Tu tarea: Asignar un nombre descriptivo único a cada tópico basándote en las palabras clave.

REGLAS OBLIGATORIAS:
1. Nombres en ESPAÑOL
2. Máximo 4 palabras por nombre
3. Nombres CONCRETOS y DESCRIPTIVOS basados en las palabras clave mostradas
4. El nombre DEBE tener COHERENCIA SEMÁNTICA - las palabras deben relacionarse lógicamente
5. NO combinar conceptos no relacionados
6. Si las palabras clave mezclan temas, identificar el tema DOMINANTE más coherente
7. Evitar adjetivos de opinión (hermoso, increíble, excelente)
8. NO usar nombres de lugares específicos
9. NO usar nombres de marcas comerciales
10. TODOS los nombres deben ser ÚNICOS - sin duplicados
11. Si dos tópicos son similares, diferenciarlos por matiz específico

NIVEL DE ESPECIFICIDAD:
- ✅ CORRECTO: """
                + ejemplos
                + """
- ❌ INCORRECTO: Muy genérico (turismo, atracción, lugar, experiencia)

IMPORTANTE - FORMATO JSON:
1. Responde SOLO con JSON válido, sin texto adicional
2. NO traduzcas nombres de campos al español
3. Usa "topics" (inglés) como campo principal
4. Usa "topic_id" y "label" (inglés) para cada tópico

{format_instructions}
"""
            )

        # Usar el proveedor de LLM robusto con reintentos y manejo de errores
        chain = crear_chain_robusto(prompt_template, pydantic_model=TopicsOutput, max_retries=3)

        return chain

    def _generar_etiquetas_fallback(self, topic_data: list[dict], categoria: str) -> dict[int, str]:
        """
        Genera etiquetas de fallback basadas en las palabras clave principales.

        Se usa cuando el LLM falla en generar etiquetas.

        Args:
            topic_data: Lista de datos de tópicos con keywords
            categoria: Nombre de la categoría padre

        Returns:
            Diccionario {topic_id: etiqueta}
        """
        topic_names = {}

        for topic in topic_data:
            topic_id = topic['id']
            keywords = topic['keywords'].split(', ')

            # Tomar las 2-3 palabras más significativas
            palabras_significativas = [kw for kw in keywords[:4] if len(kw) > 3 and not kw.isdigit()]

            if palabras_significativas:
                # Crear etiqueta con las primeras 2-3 palabras
                etiqueta = ' '.join(palabras_significativas[:3]).title()
                topic_names[topic_id] = etiqueta
            else:
                topic_names[topic_id] = f'{categoria} - Tópico {topic_id}'

        return topic_names

    def _etiquetar_topicos_con_llm(
        self, topic_data: list[dict], topics_info_text: str, categoria: str, max_retries: int = 3
    ) -> dict[int, str]:
        """
        Etiqueta tópicos usando LLM con manejo robusto de errores.

        Args:
            topic_data: Lista de datos de tópicos
            topics_info_text: Texto formateado con info de tópicos
            categoria: Nombre de la categoría
            max_retries: Número de reintentos

        Returns:
            Diccionario {topic_id: etiqueta}
        """
        topic_names = {}
        topic_names[-1] = 'Opiniones Diversas'  # Outliers siempre

        if not topic_data:
            return topic_names

        try:
            clasificador_llm = self._configurar_clasificador_llm(categoria)

            # Generar valor default basado en keywords
            default_topics = [
                {'topic_id': t['id'], 'label': t['keywords'].split(',')[0].strip().title()} for t in topic_data
            ]
            default_value = {'topics': default_topics}

            # Invocar con el chain robusto
            resultado_llm = clasificador_llm.invoke(
                {'topics_info': topics_info_text}, default_value=default_value, max_retries=max_retries
            )

            # Extraer etiquetas
            for topic_label in resultado_llm.topics:
                topic_names[topic_label.topic_id] = topic_label.label

            logger.info(f'   ✓ {len(resultado_llm.topics)} tópicos etiquetados con LLM')

        except LLMRetryExhaustedError:
            logger.warning(
                f"   ⚠️ LLM falló para '{categoria}' después de reintentos. Usando etiquetas basadas en keywords."
            )
            # Usar fallback basado en keywords
            fallback_names = self._generar_etiquetas_fallback(topic_data, categoria)
            topic_names.update(fallback_names)

        except LLMQuotaExhaustedError:
            # Quota errors are non-transient — propagate immediately with clear message
            raise

        except Exception as e:
            logger.error(f'   ❌ Error inesperado etiquetando tópicos: {e}')
            # Usar fallback
            fallback_names = self._generar_etiquetas_fallback(topic_data, categoria)
            topic_names.update(fallback_names)

        return topic_names

    def _analizar_categoria(self, df: pd.DataFrame, categoria: str) -> dict:
        """
        Analiza sub-tópicos para una categoría específica.
        Retorna diccionario con mapeo índice -> {categoria: nombre_tópico}.
        """

        # Filtrar opiniones de esta categoría (excluyendo listas vacías [])
        def tiene_categoria(x):
            cats_str = str(x).strip()
            # Excluir explícitamente listas vacías y valores nulos
            if cats_str in ['[]', '{}', '', 'nan', 'None']:
                return False
            return categoria in cats_str

        mask = df['Categorias'].apply(tiene_categoria)
        df_categoria = df[mask].copy()

        num_opiniones = len(df_categoria)

        if num_opiniones < self.min_opiniones_categoria:
            return {}

        # Extraer textos and look up pre-computed embeddings
        textos_series = df_categoria['TituloReview'].dropna()
        textos = textos_series.tolist()

        if not textos:
            return {}

        # Retrieve pre-computed embeddings for this category's texts
        cat_embeddings = self._get_precomputed_embeddings(textos)

        # Crear y entrenar modelo BERTopic con manejo robusto de errores
        try:
            topic_model = self._crear_bertopic(textos)
            topics, _ = topic_model.fit_transform(textos, embeddings=cat_embeddings)
        except ValueError as e:
            # Error común: parámetros incompatibles del vectorizador
            if 'max_df corresponds to' in str(e) or 'min_df' in str(e):
                print(f"      ⚠️  Vectorizador falló para '{categoria}' ({len(textos)} textos): {e!s}")
                print('      Reintentando con parámetros simplificados...')
                try:
                    # Fallback: configuración minimalista
                    topic_model = self._crear_bertopic_fallback(textos)
                    topics, _ = topic_model.fit_transform(textos, embeddings=cat_embeddings)
                except Exception as e2:
                    print(f'      ✗ Fallback también falló: {e2!s}')
                    return {}
            else:
                print(f"      ✗ Error inesperado en BERTopic para '{categoria}': {e!s}")
                return {}
        except Exception as e:
            print(f"      ✗ Error al procesar '{categoria}': {e!s}")
            return {}

        # Obtener información de tópicos
        try:
            topic_info = topic_model.get_topic_info()
        except Exception as e:
            print(f"      ✗ Error al extraer información de tópicos para '{categoria}': {e!s}")
            return {}

        # Validar que se encontraron tópicos significativos
        topics_validos = [t for t in topic_info['Topic'] if t != -1]
        if len(topics_validos) == 0:
            print(
                f"      ℹ️  No se identificaron tópicos específicos para '{categoria}' (todos clasificados como outliers)"
            )
            return {}

        # Preparar información para LLM
        topics_info_text = ''
        topic_data = []

        for topic_id in topic_info['Topic']:
            if topic_id == -1:
                continue

            topic_words = topic_model.get_topic(topic_id)
            if not topic_words:
                continue

            keywords = ', '.join([word for word, _ in topic_words[:8]])

            # Safely get count for this topic
            topic_rows = topic_info[topic_info['Topic'] == topic_id]
            if len(topic_rows) == 0:
                continue
            count = topic_rows['Count'].iloc[0]

            topic_data.append({'id': topic_id, 'keywords': keywords, 'count': count})

            topics_info_text += f'Tópico {topic_id}: {keywords} (documentos: {count})\n'

        # Etiquetar tópicos con LLM (con manejo robusto de errores)
        topic_names = self._etiquetar_topicos_con_llm(
            topic_data=topic_data, topics_info_text=topics_info_text, categoria=categoria, max_retries=3
        )

        # Crear mapeo índice -> {categoria: nombre_tópico}
        mapeo_topicos = {}
        for idx, topic_id in enumerate(topics):
            # Safety: ensure idx is within bounds
            if idx >= len(df_categoria):
                continue
            original_idx = df_categoria.iloc[idx].name
            topico_nombre = topic_names.get(topic_id, 'Opiniones Diversas')
            mapeo_topicos[original_idx] = {categoria: topico_nombre}

        return mapeo_topicos

    def ya_procesado(self):
        """
        Verifica si esta fase ya fue ejecutada.
        Revisa si existe la columna 'Topico' en el dataset.
        """
        try:
            df = pd.read_csv(self.dataset_path)
            return 'Topico' in df.columns
        except Exception:
            return False

    def procesar(self, forzar=False):
        """
        Procesa el dataset completo:
        1. Identifica categorías con suficientes opiniones
        2. Aplica BERTopic a cada categoría
        3. Etiqueta tópicos con LLM
        4. Añade columna 'Topico' al dataset como DICCIONARIO {categoria: topico}

        Args:
            forzar: Si es True, ejecuta incluso si ya fue procesado
        """
        if not forzar and self.ya_procesado():
            print('   ⏭️  Fase ya ejecutada previamente (omitiendo)')
            return

        # Cargar dataset
        df = pd.read_csv(self.dataset_path)

        # Pre-compute all embeddings once for the entire dataset.
        # This avoids redundant model loads and re-encoding for reviews
        # that belong to multiple categories (~1.8 categories/review avg).
        print('   ⏳ Pre-computing embeddings for all texts (one-time cost)...')
        all_texts = df['TituloReview'].dropna().unique().tolist()
        self._all_embeddings = self._embedding_model.encode(all_texts, show_progress_bar=False)
        self._all_texts = all_texts
        self._text_to_idx = {text: i for i, text in enumerate(all_texts)}
        print(f'   ✓ {len(all_texts)} unique texts embedded')

        # Inicializar diccionario para acumular tópicos por índice
        topicos_por_indice = {idx: {} for idx in df.index}

        # Extraer todas las categorías únicas
        todas_categorias = set()
        opiniones_sin_categoria = 0

        for cats in df['Categorias']:
            if pd.notna(cats):
                cats_str = str(cats).strip()
                # Detectar listas vacías explícitamente
                if cats_str in ['[]', '{}', '']:
                    opiniones_sin_categoria += 1
                    continue

                # Parsear la lista de categorías (formato string de lista)
                cats_str = cats_str.strip('[]\'"')
                cats_list = [c.strip() for c in cats_str.split(',')]
                todas_categorias.update(cats_list)

        # Filtrar categorías válidas (no vacías)
        categorias_validas = [c for c in todas_categorias if c and c.strip()]

        if opiniones_sin_categoria > 0:
            print(
                f'   • {opiniones_sin_categoria} opiniones sin categoría asignada (se omitirán del análisis de tópicos)'
            )

        print(f'Analizando {len(categorias_validas)} categorías únicas...')
        print(f'   (Umbral mínimo: {self.min_opiniones_categoria} opiniones por categoría)')

        categorias_procesadas = 0
        categorias_omitidas = []

        # Procesar cada categoría con barra de progreso
        for categoria in tqdm(categorias_validas, desc='   Progreso'):
            # Contar opiniones en esta categoría (excluyendo listas vacías)
            def tiene_categoria(x, _cat=categoria):
                cats_str = str(x).strip()
                if cats_str in ['[]', '{}', '', 'nan', 'None']:
                    return False
                return _cat in cats_str

            mask = df['Categorias'].apply(tiene_categoria)
            num_opiniones = mask.sum()

            if num_opiniones < self.min_opiniones_categoria:
                categorias_omitidas.append((categoria, num_opiniones))
                continue

            print(f'  • {categoria}: {num_opiniones} opiniones - procesando...')

            # Analizar sub-tópicos
            mapeo_topicos = self._analizar_categoria(df, categoria)

            if mapeo_topicos:
                categorias_procesadas += 1

            # Asignar tópicos al diccionario (ACUMULATIVO - múltiples tópicos por reseña)
            for idx, topico_dict in mapeo_topicos.items():
                topicos_por_indice[idx].update(topico_dict)

        # Convertir diccionarios a strings para guardar en CSV
        df['Topico'] = [str(topicos_por_indice[idx]) if topicos_por_indice[idx] else '{}' for idx in df.index]

        # Guardar dataset actualizado
        df.to_csv(self.dataset_path, index=False)

        # Estadísticas
        num_con_topico = sum(1 for idx in df.index if topicos_por_indice[idx])
        total_topicos = sum(len(topicos_por_indice[idx]) for idx in df.index)
        promedio_topicos = total_topicos / num_con_topico if num_con_topico > 0 else 0

        print('✅ Análisis de tópicos completado.')
        print(f'   • Categorías procesadas: {categorias_procesadas}/{len(categorias_validas)}')

        if categorias_omitidas:
            print(f'   • Categorías omitidas ({len(categorias_omitidas)}): no alcanzaron el umbral mínimo')
            for cat, num in sorted(categorias_omitidas, key=lambda x: x[1], reverse=True)[:5]:
                print(f'     - {cat}: {num} opiniones (necesita {self.min_opiniones_categoria})')
            if len(categorias_omitidas) > 5:
                print(f'     ... y {len(categorias_omitidas) - 5} más')

        print(f'   • Opiniones con tópico asignado: {num_con_topico}/{len(df)}')
        if num_con_topico > 0:
            print(f'   • Promedio de tópicos por opinión: {promedio_topicos:.2f}')
        else:
            print('   ⚠️  Ninguna opinión recibió tópicos - considera usar un dataset más grande')
