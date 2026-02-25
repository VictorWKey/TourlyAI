"""
Configuración del Sistema
=========================
Define configuraciones globales para el pipeline de análisis.
"""

import os
from pathlib import Path


class ConfigLLM:
    """
    Configuración para selección de LLM (API o Local).

    Modos disponibles:
    - 'api': Usa OpenAI API (requiere OPENAI_API_KEY)
    - 'local': Usa Ollama localmente (requiere Ollama instalado)
    - 'none': Sin LLM (fases 6 y 7 no disponibles)

    Para cambiar el modo, establece la variable de entorno LLM_MODE
    o modifica directamente LLM_MODE_DEFAULT.
    """

    # Modo por defecto (puede ser sobreescrito por variable de entorno)
    LLM_MODE_DEFAULT = 'local'  # 'api', 'local' o 'none'

    # Obtener modo desde variable de entorno o usar default
    LLM_MODE = os.getenv('LLM_MODE', LLM_MODE_DEFAULT).lower()

    # Validar modo
    if LLM_MODE not in ['api', 'local', 'none']:
        raise ValueError(f"LLM_MODE inválido: '{LLM_MODE}'. Valores válidos: 'api', 'local' o 'none'")

    # Configuración para API (OpenAI)
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')

    # Configuración para Local (Ollama)
    OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    # No hardcoded fallback — the model MUST come from the Electron config
    # via the OLLAMA_MODEL env var.  If it is missing the user never finished
    # the setup wizard or a config-sync bug occurred.
    OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', '')

    # Parámetros compartidos
    LLM_TEMPERATURE = float(os.getenv('LLM_TEMPERATURE', '0'))

    @classmethod
    def validar_configuracion(cls):
        """Valida que la configuración sea correcta según el modo seleccionado."""
        if cls.LLM_MODE == 'api':
            if not cls.OPENAI_API_KEY:
                raise ValueError(
                    "Modo 'api' seleccionado pero OPENAI_API_KEY no está configurado. "
                    'Agrega tu clave en el archivo .env o como variable de entorno.'
                )
        elif cls.LLM_MODE == 'local':
            # Validate that an Ollama model was actually configured
            if not cls.OLLAMA_MODEL:
                raise ValueError(
                    "Modo 'local' seleccionado pero OLLAMA_MODEL no está configurado. "
                    'Ejecuta el asistente de configuración o establece la variable de entorno OLLAMA_MODEL.'
                )
        elif cls.LLM_MODE == 'none':
            # No LLM mode - no validation needed
            pass

        return True

    @classmethod
    def get_info(cls):
        """Retorna información sobre la configuración actual."""
        info = {'modo': cls.LLM_MODE, 'temperatura': cls.LLM_TEMPERATURE}

        if cls.LLM_MODE == 'api':
            info['modelo'] = cls.OPENAI_MODEL
            info['api_key_configurada'] = bool(cls.OPENAI_API_KEY)
        elif cls.LLM_MODE == 'none':
            info['modelo'] = 'none'
            info['nota'] = 'Modo sin LLM - fases 6 y 7 no disponibles'
        else:
            info['modelo'] = cls.OLLAMA_MODEL
            info['base_url'] = cls.OLLAMA_BASE_URL

        return info


class ConfigDataset:
    """Configuración de rutas de datos."""

    # Get the python directory (parent of config directory)
    PRODUCTION_DIR = Path(__file__).parent.parent

    MODELS_DIR = PRODUCTION_DIR / 'models'

    @classmethod
    def get_default_data_dir(cls) -> Path:
        """Returns the default (bundled) data directory, always python/data/.
        Use this for locating original/input files."""
        return cls.PRODUCTION_DIR / 'data'

    @classmethod
    def get_default_dataset_path(cls) -> Path:
        """Returns the default (bundled) dataset path.
        Use this when looking for the original input dataset."""
        return cls.get_default_data_dir() / 'dataset.csv'

    @classmethod
    def get_data_dir(cls) -> Path:
        """Returns the working/output data directory.
        Priority: DATA_DIR env var > OUTPUT_DIR env var > python/data/ default.
        The Electron bridge sets DATA_DIR to userData/python-env/data/
        so that output data survives app auto-updates (Issue #3)."""
        # DATA_DIR is the direct path (set by bridge.ts for userData persistence)
        data_dir = os.getenv('DATA_DIR', '')
        if data_dir:
            p = Path(data_dir)
            p.mkdir(parents=True, exist_ok=True)
            return p
        # OUTPUT_DIR is the user's custom output directory (adds /data suffix)
        output_dir = os.getenv('OUTPUT_DIR', '')
        if output_dir:
            return Path(output_dir) / 'data'
        return cls.PRODUCTION_DIR / 'data'

    @classmethod
    def get_dataset_path(cls) -> Path:
        """Returns the working/output dataset path where phases read/write processed data."""
        return cls.get_data_dir() / 'dataset.csv'

    @classmethod
    def get_shared_dir(cls) -> Path:
        """Returns the shared data directory."""
        return cls.get_data_dir() / 'shared'

    @classmethod
    def get_visualizaciones_dir(cls) -> Path:
        """Returns the visualizations output directory."""
        return cls.get_data_dir() / 'visualizaciones'

    # Keep static references for backward compatibility (default paths)
    _output_dir = os.getenv('OUTPUT_DIR', '')
    _data_dir_env = os.getenv('DATA_DIR', '')
    DATA_DIR = (
        Path(_data_dir_env) if _data_dir_env
        else Path(_output_dir) / 'data' if _output_dir
        else PRODUCTION_DIR / 'data'
    )

    # Archivos principales
    DATASET_PATH = DATA_DIR / 'dataset.csv'
    SHARED_DIR = DATA_DIR / 'shared'

    # Issue #3: Local cache directory for HuggingFace models.
    # When running inside the Electron app, MODELS_CACHE_DIR env var points
    # to userData/python-env/models/hf_cache/ so models survive app updates.
    # Fallback: python/models/hf_cache/ (development or standalone usage).
    _models_cache_env = os.getenv('MODELS_CACHE_DIR', '')
    MODELS_CACHE_DIR = Path(_models_cache_env) if _models_cache_env else MODELS_DIR / 'hf_cache'

    # HuggingFace model IDs (downloaded from cloud into MODELS_CACHE_DIR)
    SENTIMENT_MODEL_ID = 'nlptown/bert-base-multilingual-uncased-sentiment'
    EMBEDDINGS_MODEL_ID = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
    MULTILABEL_MODEL_ID = 'victorwkey/tourism-categories-bert'
    SUBJECTIVITY_MODEL_ID = 'victorwkey/tourism-subjectivity-bert'

    # Local threshold files (optional, models have default thresholds)
    MULTILABEL_THRESHOLDS_PATH = MODELS_DIR / 'multilabel_task' / 'optimal_thresholds.json'
    SUBJECTIVITY_THRESHOLDS_PATH = MODELS_DIR / 'subjectivity_task' / 'optimal_thresholds.json'

    @classmethod
    def get_models_cache_dir(cls) -> str:
        """Returns the absolute path to the local models cache directory as a string."""
        cls.MODELS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        return str(cls.MODELS_CACHE_DIR)

    @classmethod
    def crear_directorios(cls):
        """Crea los directorios necesarios si no existen."""
        cls.get_data_dir().mkdir(parents=True, exist_ok=True)
        cls.get_shared_dir().mkdir(parents=True, exist_ok=True)
        cls.get_visualizaciones_dir().mkdir(parents=True, exist_ok=True)
        cls.MODELS_DIR.mkdir(parents=True, exist_ok=True)
        cls.MODELS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
