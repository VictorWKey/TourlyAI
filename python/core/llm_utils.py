"""
LLM Utilities
==============
Utilidades robustas para trabajar con LLMs incluyendo:
- Retry con exponential backoff
- Reparación de JSON malformado
- Parsing tolerante a errores
- Logging estructurado
"""

import json
import logging
import re
import time
from collections.abc import Callable
from functools import wraps
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

# Configurar logging
logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


class LLMError(Exception):
    """Error base para operaciones de LLM."""

    pass


class LLMParsingError(LLMError):
    """Error al parsear respuesta del LLM."""

    pass


class LLMRetryExhaustedError(LLMError):
    """Se agotaron todos los reintentos."""

    pass


class LLMEmptyResponseError(LLMError):
    """El LLM devolvió una respuesta vacía."""

    pass


def extraer_json_de_respuesta(texto: str) -> str | None:
    """
    Extrae JSON de una respuesta de LLM que puede contener texto adicional.

    Estrategias:
    1. Buscar bloques de código markdown con JSON
    2. Buscar JSON directo
    3. Limpiar y reparar JSON malformado

    Args:
        texto: Respuesta cruda del LLM

    Returns:
        String JSON limpio o None si no se puede extraer
    """
    if not texto or not texto.strip():
        return None

    texto = texto.strip()

    # Estrategia 1: Buscar bloques de código markdown
    patrones_markdown = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
    ]

    for patron in patrones_markdown:
        match = re.search(patron, texto, re.IGNORECASE)
        if match:
            json_str = match.group(1).strip()
            if json_str.startswith('{') or json_str.startswith('['):
                return json_str

    # Estrategia 2: Buscar JSON directo (objeto o array)
    # Encontrar el primer { o [ y su correspondiente cierre
    inicio_obj = texto.find('{')
    inicio_arr = texto.find('[')

    if inicio_obj == -1 and inicio_arr == -1:
        return None

    if inicio_obj == -1:
        inicio = inicio_arr
        char_inicio, char_fin = '[', ']'
    elif inicio_arr == -1:
        inicio = inicio_obj
        char_inicio, char_fin = '{', '}'
    else:
        if inicio_obj < inicio_arr:
            inicio = inicio_obj
            char_inicio, char_fin = '{', '}'
        else:
            inicio = inicio_arr
            char_inicio, char_fin = '[', ']'

    # Encontrar el cierre correspondiente
    nivel = 0
    fin = -1
    en_string = False
    escape = False

    for i in range(inicio, len(texto)):
        char = texto[i]

        if escape:
            escape = False
            continue

        if char == '\\':
            escape = True
            continue

        if char == '"' and not escape:
            en_string = not en_string
            continue

        if not en_string:
            if char == char_inicio:
                nivel += 1
            elif char == char_fin:
                nivel -= 1
                if nivel == 0:
                    fin = i + 1
                    break

    if fin > inicio:
        return texto[inicio:fin]

    return None


def reparar_json(json_str: str) -> str:
    """
    Intenta reparar JSON malformado común de LLMs.

    Args:
        json_str: String JSON potencialmente malformado

    Returns:
        String JSON reparado
    """
    if not json_str:
        return json_str

    resultado = json_str

    # Remover BOM y caracteres invisibles
    resultado = resultado.strip('\ufeff\u200b\u200c\u200d')

    # Reparar comillas simples usadas como comillas JSON
    # Solo fuera de strings ya existentes
    resultado = re.sub(r"(?<=[{,:\[])\s*'([^']*?)'\s*(?=[},:\]])", r'"\1"', resultado)

    # Reparar trailing commas antes de ] o }
    resultado = re.sub(r',\s*([}\]])', r'\1', resultado)

    # Reparar falta de comillas en claves
    resultado = re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', resultado)

    # Reparar valores True/False/None de Python a JSON
    resultado = re.sub(r'\bTrue\b', 'true', resultado)
    resultado = re.sub(r'\bFalse\b', 'false', resultado)
    resultado = re.sub(r'\bNone\b', 'null', resultado)

    # Reparar newlines dentro de strings
    resultado = re.sub(r'(?<!\\)\n(?=[^"]*"(?:[^"]*"[^"]*")*[^"]*$)', r'\\n', resultado)

    return resultado


def parsear_json_seguro(texto: str) -> dict | None:
    """
    Parsea JSON de forma tolerante a errores.

    Args:
        texto: String que contiene JSON

    Returns:
        Diccionario parseado o None
    """
    if not texto:
        return None

    # Intentar extraer JSON primero
    json_str = extraer_json_de_respuesta(texto)
    if not json_str:
        return None

    # Intento 1: Parseo directo
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    # Intento 2: Reparar y parsear
    try:
        reparado = reparar_json(json_str)
        return json.loads(reparado)
    except json.JSONDecodeError:
        pass

    # Intento 3: Usar eval de Python (para casos extremos)
    try:
        import ast

        return ast.literal_eval(json_str)
    except (ValueError, SyntaxError):
        pass

    return None


def parsear_pydantic_seguro(texto: str, modelo: type[T], valores_default: dict | None = None) -> T | None:
    """
    Parsea una respuesta LLM a un modelo Pydantic de forma robusta.

    Args:
        texto: Respuesta del LLM
        modelo: Clase Pydantic objetivo
        valores_default: Valores default si falla el parsing

    Returns:
        Instancia del modelo o None
    """
    if not texto:
        if valores_default:
            try:
                return modelo(**valores_default)
            except ValidationError:
                return None
        return None

    # Parsear JSON
    data = parsear_json_seguro(texto)

    if data is None:
        if valores_default:
            try:
                return modelo(**valores_default)
            except ValidationError:
                return None
        return None

    # Crear instancia Pydantic
    try:
        return modelo(**data)
    except ValidationError as e:
        logger.warning(f'Error de validación Pydantic: {e}')
        if valores_default:
            try:
                return modelo(**valores_default)
            except ValidationError:
                return None
        return None


class RetryConfig:
    """Configuración para reintentos."""

    def __init__(
        self,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 30.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
    ):
        """
        Args:
            max_retries: Número máximo de reintentos
            initial_delay: Delay inicial en segundos
            max_delay: Delay máximo en segundos
            exponential_base: Base para exponential backoff
            jitter: Si agregar variación aleatoria al delay
        """
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter

    def get_delay(self, intento: int) -> float:
        """Calcula el delay para un intento específico."""
        import random

        delay = self.initial_delay * (self.exponential_base**intento)
        delay = min(delay, self.max_delay)

        if self.jitter:
            delay *= 0.5 + random.random()

        return delay


def con_reintentos(
    config: RetryConfig | None = None,
    excepciones_reintentables: tuple = (Exception,),
    on_retry: Callable[[int, Exception], None] | None = None,
):
    """
    Decorador para agregar reintentos con exponential backoff.

    Args:
        config: Configuración de reintentos
        excepciones_reintentables: Tupla de excepciones que disparan reintento
        on_retry: Callback llamado en cada reintento (intento, excepcion)
    """
    if config is None:
        config = RetryConfig()

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            ultimo_error = None

            for intento in range(config.max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except excepciones_reintentables as e:
                    ultimo_error = e

                    if intento < config.max_retries:
                        if on_retry:
                            on_retry(intento + 1, e)
                        else:
                            logger.warning(
                                f'Intento {intento + 1}/{config.max_retries + 1} falló: {e}. Reintentando...'
                            )
                    else:
                        logger.error(
                            f'Todos los reintentos agotados ({config.max_retries + 1} intentos). Último error: {e}'
                        )

            raise LLMRetryExhaustedError(
                f'Operación falló después de {config.max_retries + 1} intentos. Último error: {ultimo_error}'
            ) from ultimo_error

        return wrapper

    return decorator


def invocar_llm_con_retry(
    chain: Any,
    input_data: dict,
    max_retries: int = 3,
    modelo_pydantic: type[T] | None = None,
    valores_default: dict | None = None,
) -> Any:
    """
    Invoca un chain de LangChain con reintentos y manejo robusto de errores.

    Args:
        chain: Chain de LangChain a invocar
        input_data: Datos de entrada para el chain
        max_retries: Número máximo de reintentos
        modelo_pydantic: Modelo Pydantic para parsing manual si el chain falla
        valores_default: Valores default si todo falla

    Returns:
        Resultado del chain o modelo parseado
    """
    config = RetryConfig(max_retries=max_retries)
    ultimo_error = None

    for intento in range(max_retries + 1):
        try:
            resultado = chain.invoke(input_data)

            # Si ya es el modelo Pydantic esperado, retornarlo
            if modelo_pydantic and isinstance(resultado, modelo_pydantic):
                return resultado

            # Si es None o vacío, y tenemos modelo Pydantic, intentar procesar
            if resultado is None and modelo_pydantic:
                raise LLMEmptyResponseError('LLM devolvió None')

            return resultado

        except LLMEmptyResponseError as e:
            ultimo_error = e
            logger.warning(f'Respuesta vacía en intento {intento + 1}/{max_retries + 1}')

        except ValidationError as e:
            ultimo_error = e
            logger.warning(f'Error de validación en intento {intento + 1}: {e}')

        except Exception as e:
            ultimo_error = e
            error_str = str(e)

            # Intentar extraer respuesta cruda del error de parsing
            if 'Got:' in error_str or 'completion' in error_str.lower():
                # El error de LangChain a veces incluye la respuesta cruda
                logger.warning(f'Error de parsing detectado: {error_str[:200]}...')
            else:
                logger.warning(f'Error en intento {intento + 1}: {e}')

        # Retry immediately
        if intento < max_retries:
            logger.info('Reintentando...')

    # Si llegamos aquí, todos los intentos fallaron
    # Intentar usar valores default
    if modelo_pydantic and valores_default:
        try:
            logger.warning(f'Usando valores default para {modelo_pydantic.__name__}')
            return modelo_pydantic(**valores_default)
        except ValidationError:
            pass

    raise LLMRetryExhaustedError(
        f'Operación LLM falló después de {max_retries + 1} intentos. Último error: {ultimo_error}'
    )


def invocar_llm_con_fallback_manual(
    llm: Any, prompt: str, modelo_pydantic: type[T], max_retries: int = 3, valores_default: dict | None = None
) -> T:
    """
    Invoca un LLM directamente y parsea manualmente la respuesta.

    Este método es más robusto que usar chains con PydanticOutputParser
    porque hace el parsing manualmente con tolerancia a errores.

    Args:
        llm: Instancia del LLM (ChatOpenAI, ChatOllama, etc.)
        prompt: Prompt formateado
        modelo_pydantic: Modelo Pydantic objetivo
        max_retries: Número máximo de reintentos
        valores_default: Valores default si todo falla

    Returns:
        Instancia del modelo Pydantic
    """
    config = RetryConfig(max_retries=max_retries)
    ultimo_error = None

    for intento in range(max_retries + 1):
        try:
            # Invocar LLM directamente
            respuesta = llm.invoke(prompt)

            # Extraer contenido
            if hasattr(respuesta, 'content'):
                texto = respuesta.content
            else:
                texto = str(respuesta)

            if not texto or texto.strip() == '':
                raise LLMEmptyResponseError('Respuesta vacía del LLM')

            # Parsear a Pydantic
            resultado = parsear_pydantic_seguro(texto, modelo_pydantic, valores_default)

            if resultado is not None:
                return resultado

            raise LLMParsingError(f'No se pudo parsear respuesta: {texto[:200]}...')

        except (LLMEmptyResponseError, LLMParsingError) as e:
            ultimo_error = e
            logger.warning(f'Error en intento {intento + 1}: {e}')

        except Exception as e:
            ultimo_error = e
            logger.warning(f'Error inesperado en intento {intento + 1}: {e}')

        if intento < max_retries:
            logger.info('Reintentando...')

    # Usar valores default si están disponibles
    if valores_default:
        try:
            logger.warning(f'Usando valores default para {modelo_pydantic.__name__}')
            return modelo_pydantic(**valores_default)
        except ValidationError as e:
            raise LLMRetryExhaustedError(f'No se pudo parsear respuesta ni usar valores default: {e}') from e

    raise LLMRetryExhaustedError(
        f'Operación LLM falló después de {max_retries + 1} intentos. Último error: {ultimo_error}'
    )
