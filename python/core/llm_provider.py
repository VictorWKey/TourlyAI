"""
Proveedor de LLM Abstracto
===========================
Proporciona una interfaz unificada para usar LLMs (API o Local).
Incluye manejo robusto de errores, reintentos y parsing tolerante.
"""

import logging
from typing import Any, TypeVar

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.output_parsers import PydanticOutputParser, StrOutputParser
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel

from config import ConfigLLM

# Configurar logging
logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


class LLMProvider:
    """
    Proveedor abstracto de LLM que soporta múltiples backends.

    Soporta:
    - OpenAI API (mediante langchain_openai)
    - Ollama Local (mediante langchain_ollama)
    """

    _instance = None
    _llm = None

    def __new__(cls):
        """Implementa patrón Singleton para reutilizar la conexión."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Inicializa el proveedor si aún no se ha hecho."""
        if self._llm is None:
            self._inicializar_llm()

    def _inicializar_llm(self):
        """Inicializa el modelo LLM según la configuración."""
        # Validar configuración
        ConfigLLM.validar_configuracion()

        if ConfigLLM.LLM_MODE == 'none':
            logger.info('Modo sin LLM - fases que requieren LLM no estarán disponibles')
            print('   ⚠ Modo sin LLM activo - fases 6 y 7 no disponibles')
            self._llm = None
            return
        if ConfigLLM.LLM_MODE == 'api':
            self._inicializar_openai()
        elif ConfigLLM.LLM_MODE == 'local':
            self._inicializar_ollama()
        else:
            raise ValueError(f'Modo LLM no soportado: {ConfigLLM.LLM_MODE}')

    def _inicializar_openai(self):
        """Inicializa el modelo OpenAI."""
        try:
            from langchain_openai import ChatOpenAI

            self._llm = ChatOpenAI(
                model=ConfigLLM.OPENAI_MODEL, temperature=ConfigLLM.LLM_TEMPERATURE, api_key=ConfigLLM.OPENAI_API_KEY
            )

            # Validate that OpenAI is reachable and the key has credits
            self._validar_openai()

            print(f'   ✓ LLM inicializado: OpenAI ({ConfigLLM.OPENAI_MODEL})')

        except ImportError as err:
            raise ImportError('langchain_openai no está instalado. Instala con: pip install langchain-openai') from err
        except Exception as e:
            raise RuntimeError(f'Error al inicializar OpenAI: {e}') from e

    def _validar_openai(self):
        """Valida que la API key de OpenAI tenga créditos disponibles."""
        from .llm_utils import LLMQuotaExhaustedError, is_openai_quota_error

        try:
            test_response = self._llm.invoke('Respond only with OK')
            if not test_response:
                raise RuntimeError('OpenAI no respondió correctamente')
        except Exception as e:
            if is_openai_quota_error(e):
                raise LLMQuotaExhaustedError(
                    'OPENAI_QUOTA_EXHAUSTED: Tu API key de OpenAI no tiene créditos disponibles. '
                    'Agrega fondos en https://platform.openai.com/account/billing '
                    'o cambia al modo de IA local (Ollama) en la configuración.'
                ) from e
            raise

    def _inicializar_ollama(self):
        """Inicializa el modelo Ollama local."""
        try:
            from langchain_ollama import ChatOllama

            self._llm = ChatOllama(
                model=ConfigLLM.OLLAMA_MODEL,
                temperature=ConfigLLM.LLM_TEMPERATURE,
                base_url=ConfigLLM.OLLAMA_BASE_URL,
                # Añadir timeout más largo para modelos locales
                timeout=120,
                # Parámetros adicionales para mejor rendimiento
                num_ctx=16384,  # Context window large enough for Phase 8 strategic insights
            )

            # Validar que Ollama esté disponible
            self._validar_ollama()

            logger.info(f'LLM inicializado: Ollama ({ConfigLLM.OLLAMA_MODEL})')
            print(f'   ✓ LLM inicializado: Ollama ({ConfigLLM.OLLAMA_MODEL})')

        except ImportError as err:
            raise ImportError('langchain_ollama no está instalado. Instala con: pip install langchain-ollama') from err
        except Exception as e:
            raise RuntimeError(
                f'Error al inicializar Ollama: {e}\n\n'
                f'Asegúrate de que:\n'
                f'1. Ollama está instalado (https://ollama.ai)\n'
                f'2. Ollama está ejecutándose (ollama serve)\n'
                f"3. El modelo '{ConfigLLM.OLLAMA_MODEL}' está descargado "
                f'(ollama pull {ConfigLLM.OLLAMA_MODEL})'
            ) from e

    def _validar_ollama(self):
        """Valida que Ollama esté disponible y el modelo descargado."""
        try:
            # Hacer una llamada de prueba simple
            test_response = self._llm.invoke("Responde solo con 'OK'")
            if not test_response:
                raise RuntimeError('Ollama no respondió correctamente')
        except Exception as e:
            raise RuntimeError(
                f'No se pudo conectar con Ollama: {e}\n\n'
                f'Pasos para solucionar:\n'
                f'1. Instala Ollama: https://ollama.ai\n'
                f'2. Inicia el servidor: ollama serve\n'
                f'3. Descarga el modelo: ollama pull {ConfigLLM.OLLAMA_MODEL}\n'
                f'4. Verifica que esté ejecutándose en: {ConfigLLM.OLLAMA_BASE_URL}'
            ) from e

    def get_llm(self) -> BaseChatModel:
        """
        Retorna la instancia del LLM configurado.

        Returns:
            Instancia de BaseChatModel (ChatOpenAI o ChatOllama)

        Raises:
            RuntimeError: Si el modo es 'none' (sin LLM configurado)
        """
        if self._llm is None:
            raise RuntimeError(
                "No hay LLM configurado. El modo actual es 'none'. "
                'Las fases que requieren LLM (6 y 7) no están disponibles. '
                'Cambia el modo en la configuración para usar un LLM.'
            )
        return self._llm

    def crear_chain_simple(self, template: str, **kwargs) -> Any:
        """
        Crea una cadena simple de LLM con template y parser de texto.

        Args:
            template: Template del prompt (puede incluir variables con {variable})
            **kwargs: Variables para partial_variables del template

        Returns:
            Chain ejecutable (template | llm | parser)
        """
        if self._llm is None:
            raise RuntimeError("No hay LLM configurado (modo 'none'). No se pueden crear chains sin un LLM activo.")

        prompt = PromptTemplate(
            template=template,
            input_variables=[var for var in self._extraer_variables(template) if var not in kwargs],
            partial_variables=kwargs,
        )

        parser = StrOutputParser()
        chain = prompt | self._llm | parser

        return chain

    def crear_chain_estructurado(self, template: str, pydantic_model: type[BaseModel], **kwargs) -> Any:
        """
        Crea una cadena de LLM con salida estructurada (Pydantic).

        Args:
            template: Template del prompt
            pydantic_model: Modelo Pydantic para parsear la salida
            **kwargs: Variables para partial_variables del template

        Returns:
            Chain ejecutable con parser estructurado
        """
        if self._llm is None:
            raise RuntimeError("No hay LLM configurado (modo 'none'). No se pueden crear chains sin un LLM activo.")

        parser = PydanticOutputParser(pydantic_object=pydantic_model)

        # Agregar format_instructions al template si no está
        if 'format_instructions' not in kwargs:
            kwargs['format_instructions'] = parser.get_format_instructions()

        prompt = PromptTemplate(
            template=template,
            input_variables=[var for var in self._extraer_variables(template) if var not in kwargs],
            partial_variables=kwargs,
        )

        chain = prompt | self._llm | parser

        return chain

    def crear_chain_estructurado_robusto(
        self, template: str, pydantic_model: type[T], **kwargs
    ) -> 'RobustStructuredChain':
        """
        Crea una cadena de LLM con salida estructurada y manejo robusto de errores.

        Esta versión incluye:
        - Reintentos automáticos con exponential backoff
        - Reparación de JSON malformado
        - Parsing tolerante a errores
        - Valores default como fallback

        Args:
            template: Template del prompt
            pydantic_model: Modelo Pydantic para parsear la salida
            **kwargs: Variables para partial_variables del template

        Returns:
            RobustStructuredChain con método invoke robusto
        """
        if self._llm is None:
            raise RuntimeError("No hay LLM configurado (modo 'none'). No se pueden crear chains sin un LLM activo.")

        parser = PydanticOutputParser(pydantic_object=pydantic_model)

        # Agregar format_instructions al template si no está
        if 'format_instructions' not in kwargs:
            kwargs['format_instructions'] = parser.get_format_instructions()

        prompt = PromptTemplate(
            template=template,
            input_variables=[var for var in self._extraer_variables(template) if var not in kwargs],
            partial_variables=kwargs,
        )

        return RobustStructuredChain(llm=self._llm, prompt=prompt, pydantic_model=pydantic_model, parser=parser)

    def _extraer_variables(self, template: str) -> list[str]:
        """Extrae las variables del template."""
        import re

        return list(set(re.findall(r'\{(\w+)\}', template)))

    @staticmethod
    def get_info() -> dict:
        """Retorna información sobre la configuración del LLM."""
        return ConfigLLM.get_info()

    @staticmethod
    def cambiar_modo(modo: str):
        """
        Cambia el modo del LLM y reinicializa.

        Args:
            modo: 'api' o 'local'
        """
        if modo not in ['api', 'local']:
            raise ValueError(f"Modo inválido: {modo}. Usa 'api' o 'local'")

        ConfigLLM.LLM_MODE = modo

        # Reinicializar singleton
        LLMProvider._instance = None
        LLMProvider._llm = None

        return LLMProvider()


class RobustStructuredChain:
    """
    Chain de LangChain con manejo robusto de errores para LLMs locales.

    Características:
    - Reintentos automáticos con exponential backoff
    - Reparación de JSON malformado
    - Parsing tolerante a errores
    - Valores default como fallback
    """

    def __init__(
        self,
        llm: BaseChatModel,
        prompt: PromptTemplate,
        pydantic_model: type[T],
        parser: PydanticOutputParser,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        """
        Args:
            llm: Instancia del LLM
            prompt: Template del prompt
            pydantic_model: Modelo Pydantic para parsear
            parser: Parser de Pydantic
            max_retries: Número máximo de reintentos
            retry_delay: Delay inicial entre reintentos
        """
        self.llm = llm
        self.prompt = prompt
        self.pydantic_model = pydantic_model
        self.parser = parser
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def invoke(self, input_data: dict, default_value: dict | None = None, max_retries: int | None = None) -> T:
        """
        Invoca el chain con manejo robusto de errores.

        Args:
            input_data: Datos de entrada para el prompt
            default_value: Valor default si todo falla
            max_retries: Sobreescribir número de reintentos

        Returns:
            Instancia del modelo Pydantic
        """
        import time

        from .llm_utils import LLMQuotaExhaustedError, LLMRetryExhaustedError, is_openai_quota_error, parsear_pydantic_seguro

        retries = max_retries if max_retries is not None else self.max_retries
        ultimo_error = None
        ultima_respuesta = None

        for intento in range(retries + 1):
            try:
                # Formatear prompt
                prompt_str = self.prompt.format(**input_data)

                # Invocar LLM
                respuesta = self.llm.invoke(prompt_str)

                # Extraer contenido
                if hasattr(respuesta, 'content'):
                    texto = respuesta.content
                else:
                    texto = str(respuesta)

                ultima_respuesta = texto

                # Verificar respuesta vacía
                if not texto or texto.strip() == '':
                    raise ValueError('Respuesta vacía del LLM')

                # Intento 1: Usar el parser de LangChain
                try:
                    return self.parser.parse(texto)
                except Exception as parse_error:
                    logger.debug(f'Parser de LangChain falló: {parse_error}')

                # Intento 2: Parsing manual robusto
                resultado = parsear_pydantic_seguro(texto, self.pydantic_model, default_value)

                if resultado is not None:
                    return resultado

                raise ValueError(f'No se pudo parsear respuesta: {texto[:200]}...')

            except Exception as e:
                # Don't retry non-transient errors (quota exhausted, auth failures)
                if is_openai_quota_error(e):
                    raise LLMQuotaExhaustedError(
                        'OPENAI_QUOTA_EXHAUSTED: Tu API key de OpenAI no tiene créditos disponibles. '
                        'Agrega fondos en https://platform.openai.com/account/billing '
                        'o cambia al modo de IA local (Ollama) en la configuración.'
                    ) from e

                ultimo_error = e
                logger.warning(f'Intento {intento + 1}/{retries + 1} falló: {str(e)[:100]}...')

                if intento < retries:
                    logger.info('Reintentando...')

        # Todos los intentos fallaron - usar default si existe
        if default_value is not None:
            try:
                logger.warning(f'Usando valor default para {self.pydantic_model.__name__}')
                return self.pydantic_model(**default_value)
            except Exception:
                pass

        # Construir mensaje de error informativo
        error_msg = f'Operación LLM falló después de {retries + 1} intentos.\nÚltimo error: {ultimo_error}\n'
        if ultima_respuesta:
            error_msg += f'Última respuesta (truncada): {ultima_respuesta[:300]}...'

        raise LLMRetryExhaustedError(error_msg)


class LLMRetryExhaustedError(Exception):
    """Se agotaron todos los reintentos del LLM."""

    pass


# Función de conveniencia para obtener el LLM
def get_llm() -> BaseChatModel:
    """
    Función de conveniencia para obtener el LLM configurado.

    Returns:
        Instancia del LLM (ChatOpenAI o ChatOllama)
    """
    provider = LLMProvider()
    return provider.get_llm()


# Función para crear chains fácilmente
def crear_chain(template: str, pydantic_model: type[BaseModel] | None = None, **kwargs):
    """
    Crea una cadena de LLM (simple o estructurada).

    Args:
        template: Template del prompt
        pydantic_model: Modelo Pydantic (opcional) para salida estructurada
        **kwargs: Variables para partial_variables

    Returns:
        Chain ejecutable
    """
    provider = LLMProvider()

    if pydantic_model:
        return provider.crear_chain_estructurado(template, pydantic_model, **kwargs)
    return provider.crear_chain_simple(template, **kwargs)


def crear_chain_robusto(
    template: str, pydantic_model: type[T], max_retries: int = 3, **kwargs
) -> RobustStructuredChain:
    """
    Crea una cadena de LLM con manejo robusto de errores.

    Esta función es preferida para LLMs locales (Ollama) que pueden
    devolver respuestas malformadas.

    Args:
        template: Template del prompt
        pydantic_model: Modelo Pydantic para la salida
        max_retries: Número de reintentos
        **kwargs: Variables para partial_variables

    Returns:
        RobustStructuredChain con método invoke robusto
    """
    provider = LLMProvider()
    return provider.crear_chain_estructurado_robusto(template, pydantic_model, **kwargs)
