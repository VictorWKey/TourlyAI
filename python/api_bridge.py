"""
JSON API Bridge for Electron Communication
==========================================
Provides a JSON-based interface for the pipeline.
Communicates via stdin/stdout with JSON messages.
"""

import json
import logging
import os
import sys
import traceback
from contextlib import contextmanager
from pathlib import Path
from typing import Any

# Centralized logging setup — must be called before any other logger usage
from config.logging_config import setup_logging

setup_logging(level=os.getenv('LOG_LEVEL', 'INFO'))

logger = logging.getLogger(__name__)

# Track if full pipeline is available
PIPELINE_AVAILABLE = False
PIPELINE_ERROR = None
ROLLBACK_AVAILABLE = False

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Try to import rollback manager
try:
    from core.rollback_manager import RollbackManager, get_rollback_manager

    ROLLBACK_AVAILABLE = True
except ImportError:
    get_rollback_manager = None
    RollbackManager = None

# Try to import pipeline components
try:
    import pandas as pd

    from core import (
        AnalizadorJerarquicoTopicos,
        AnalizadorSentimientos,
        AnalizadorSubjetividad,
        ClasificadorCategorias,
        GeneradorEstadisticasBasicas,
        GeneradorInsightsEstrategicos,
        GeneradorVisualizaciones,
        LLMProvider,
        ProcesadorBasico,
        ResumidorInteligente,
    )

    PIPELINE_AVAILABLE = True
except ImportError as e:
    PIPELINE_ERROR = str(e)
    # Create placeholder classes for when pipeline is not available
    pd = None
    ProcesadorBasico = None
    GeneradorEstadisticasBasicas = None
    AnalizadorSentimientos = None
    AnalizadorSubjetividad = None
    ClasificadorCategorias = None
    AnalizadorJerarquicoTopicos = None
    ResumidorInteligente = None
    GeneradorInsightsEstrategicos = None
    GeneradorVisualizaciones = None
    LLMProvider = None


class ProgressReporter:
    """Reports progress back to Electron via stdout."""

    def __init__(self, phase: int, phase_name: str):
        self.phase = phase
        self.phase_name = phase_name
        self.last_reported = 0

    def report(self, progress: int, message: str = ''):
        """Send progress update to Electron."""
        # Avoid sending duplicate progress updates
        if progress == self.last_reported and message == '':
            return

        self.last_reported = progress
        response = {
            'type': 'progress',
            'phase': self.phase,
            'phaseName': self.phase_name,
            'progress': progress,
            'message': message,
        }
        # Save and restore stdout to ensure JSON goes to real stdout
        old_stdout = sys.stdout
        sys.stdout = sys.__stdout__
        print(json.dumps(response), flush=True)
        sys.stdout = old_stdout


class TqdmProgressCapture:
    """Capture tqdm progress and convert to progress updates."""

    def __init__(self, reporter: ProgressReporter):
        self.reporter = reporter
        self.old_stderr = None

    def __enter__(self):
        """Enable tqdm progress capture."""
        # Set environment variable to enable our custom tqdm callback
        os.environ['TQDM_DISABLE'] = '0'
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Cleanup."""
        pass

    def parse_tqdm_line(self, line: str):
        """Parse tqdm progress line and report progress."""
        if 'Progreso:' in line and '%|' in line:
            try:
                # Extract percentage from tqdm output
                # Format: "Progreso:  42%|████▏     | 205/483 [00:01<00:01, 154.06it/s]"
                percent_part = line.split('Progreso:')[1].split('%')[0].strip()
                progress = int(float(percent_part))

                # Extract current/total if available
                if '|' in line and '/' in line:
                    parts = line.split('|')[1].split('[')[0].strip().split('/')
                    if len(parts) == 2:
                        current = parts[0].strip()
                        total = parts[1].strip().split()[0]
                        message = f'Procesando {current}/{total}'
                        self.reporter.report(progress, message)
                    else:
                        self.reporter.report(progress)
                else:
                    self.reporter.report(progress)
            except (ValueError, IndexError):
                # If parsing fails, just ignore
                pass


@contextmanager
def redirect_stdout_to_stderr():
    """
    Context manager to redirect stdout to stderr.
    This prevents pipeline print statements from breaking JSON communication.
    """
    old_stdout = sys.stdout
    try:
        sys.stdout = sys.stderr
        yield
    finally:
        sys.stdout = old_stdout


class PipelineAPI:
    """JSON API for the analysis pipeline."""

    def __init__(self):
        self.current_phase = None
        self.should_stop = False
        self._current_session_id: str | None = None

        # Initialize rollback manager if available
        self.rollback_manager = get_rollback_manager() if ROLLBACK_AVAILABLE else None

        # Build phases dictionary only if pipeline is available
        if PIPELINE_AVAILABLE:
            self.PHASES = {
                1: ('Procesamiento Básico', ProcesadorBasico),
                2: ('Estadísticas Básicas', GeneradorEstadisticasBasicas),
                3: ('Análisis de Sentimientos', AnalizadorSentimientos),
                4: ('Análisis de Subjetividad', AnalizadorSubjetividad),
                5: ('Clasificación de Categorías', ClasificadorCategorias),
                6: ('Análisis Jerárquico de Tópicos', AnalizadorJerarquicoTopicos),
                7: ('Resumen Inteligente', ResumidorInteligente),
                8: ('Insights Estratégicos', GeneradorInsightsEstrategicos),
                9: ('Generación de Visualizaciones', GeneradorVisualizaciones),
            }
        else:
            self.PHASES = {
                1: ('Procesamiento Básico', None),
                2: ('Estadísticas Básicas', None),
                3: ('Análisis de Sentimientos', None),
                4: ('Análisis de Subjetividad', None),
                5: ('Clasificación de Categorías', None),
                6: ('Análisis Jerárquico de Tópicos', None),
                7: ('Resumen Inteligente', None),
                8: ('Insights Estratégicos', None),
                9: ('Generación de Visualizaciones', None),
            }

    def execute(self, command: dict[str, Any]) -> dict[str, Any]:
        """Execute a pipeline command and return JSON response."""
        try:
            action = command.get('action')

            handlers = {
                'run_phase': self._run_phase,
                'run_all': self._run_all,
                'stop': self._stop,
                'stop_and_rollback': self._stop_and_rollback,
                'rollback': self._rollback,
                'get_status': self._get_status,
                'set_output_dir': self._set_output_dir,
                'validate_dataset': self._validate_dataset,
                'apply_column_mapping': self._apply_column_mapping,
                'get_required_columns': self._get_required_columns,
                'validate_phase_dependencies': self._validate_phase_dependencies,
                'get_llm_info': self._get_llm_info,
                'check_ollama': self._check_ollama,
                'ping': self._ping,
                'check_pipeline': self._check_pipeline,
                'check_models_status': self._check_models_status,
                'download_models': self._download_models,
                'download_model': self._download_model,
                'get_download_size': self._get_download_size,
                'preload_models': self._preload_models,
            }

            handler = handlers.get(action)
            if not handler:
                return {'success': False, 'error': f'Unknown action: {action}'}

            return handler(command)

        except Exception as e:
            # On any exception, try to rollback if we have an active session
            if self.rollback_manager and self._current_session_id:
                self.rollback_manager.rollback(self._current_session_id)
                self._current_session_id = None

            return {'success': False, 'error': str(e), 'traceback': traceback.format_exc()}

    def _ping(self, command: dict) -> dict:
        """Health check endpoint."""
        return {'success': True, 'message': 'pong', 'status': 'ready', 'pipelineAvailable': PIPELINE_AVAILABLE}

    def _check_pipeline(self, command: dict) -> dict:
        """Check if full pipeline is available."""
        return {
            'success': True,
            'available': PIPELINE_AVAILABLE,
            'error': PIPELINE_ERROR if not PIPELINE_AVAILABLE else None,
        }

    def _set_output_dir(self, command: dict) -> dict:
        """Set the output directory for data and visualizations."""
        output_dir = command.get('output_dir', '')
        if output_dir:
            os.environ['OUTPUT_DIR'] = output_dir
            logger.info(f'Output directory set to: {output_dir}')
        else:
            os.environ.pop('OUTPUT_DIR', None)
            logger.info('Output directory reset to default')
        return {'success': True, 'output_dir': output_dir}

    def _run_phase(self, command: dict) -> dict:
        """Run a specific pipeline phase with rollback support."""
        if not PIPELINE_AVAILABLE:
            return {'success': False, 'error': f'Pipeline not available: {PIPELINE_ERROR}'}

        phase = command.get('phase')
        config = command.get('config', {})
        force = config.get('force', True)

        if phase not in self.PHASES:
            return {'success': False, 'error': f'Invalid phase: {phase}'}

        phase_name, phase_class = self.PHASES[phase]
        reporter = ProgressReporter(phase, phase_name)

        self.current_phase = phase
        self.should_stop = False
        reporter.report(0, 'Iniciando fase...')

        # Ensure output directories exist (important for custom output dirs)
        from config.config import ConfigDataset

        ConfigDataset.crear_directorios()

        # Begin rollback session before phase execution
        session_id = None
        if self.rollback_manager:
            session_id = self.rollback_manager.begin_phase(phase)
            self._current_session_id = session_id

        try:
            # Redirect stdout to stderr to prevent pipeline print statements
            # from breaking JSON communication
            with redirect_stdout_to_stderr():
                # Check for stop signal before starting
                if self.should_stop:
                    raise InterruptedError('Phase stopped by user before execution')

                # Instantiate and run phase
                if phase == 1:
                    # Phase 1 needs the input dataset path (user-selected file)
                    input_dataset = config.get('dataset') or config.get('input_path')
                    processor = phase_class(input_path=input_dataset)
                elif phase == 7:
                    # Phase 7 with custom parameters
                    processor = ResumidorInteligente(
                        top_n_subtopicos=config.get('top_n_subtopicos', 3),
                        incluir_neutros=config.get('incluir_neutros', False),
                    )
                elif phase == 8:
                    # Phase 8 with progress callback
                    processor = phase_class(progress_callback=lambda p, m: reporter.report(p, m))
                else:
                    processor = phase_class()

                # Run the phase
                processor.procesar(forzar=force)

                # Check for stop signal after completion
                if self.should_stop:
                    raise InterruptedError('Phase stopped by user during execution')

            # Phase completed successfully - commit the session (cleanup backups)
            if self.rollback_manager and session_id:
                self.rollback_manager.commit(session_id)
                self._current_session_id = None

            reporter.report(100, 'Fase completada')

            # Build output paths dynamically from ConfigDataset
            from config.config import ConfigDataset

            output_paths = {
                'datasetPath': str(ConfigDataset.get_dataset_path()),
                'chartsPath': str(ConfigDataset.get_visualizaciones_dir()),
                'summaryPath': str(ConfigDataset.get_shared_dir() / 'resumenes.json'),
            }

            return {
                'success': True,
                'phase': phase,
                'phaseName': phase_name,
                'status': 'completed',
                'outputs': output_paths,
            }

        except InterruptedError as e:
            # User requested stop - rollback changes
            rollback_result = None
            if self.rollback_manager and session_id:
                rollback_result = self.rollback_manager.rollback(session_id)
                self._current_session_id = None

            return {
                'success': False,
                'phase': phase,
                'phaseName': phase_name,
                'status': 'stopped',
                'error': str(e),
                'rollback': rollback_result,
            }

        except Exception as e:
            # Error occurred - rollback changes
            rollback_result = None
            if self.rollback_manager and session_id:
                rollback_result = self.rollback_manager.rollback(session_id)
                self._current_session_id = None

            return {
                'success': False,
                'phase': phase,
                'phaseName': phase_name,
                'status': 'error',
                'error': str(e),
                'traceback': traceback.format_exc(),
                'rollback': rollback_result,
            }
        finally:
            self.current_phase = None

    def _run_all(self, command: dict) -> dict:
        """Run all pipeline phases sequentially."""
        config = command.get('config', {})
        phases_config = config.get('phases', {})
        results = []

        for phase in range(1, 10):
            if self.should_stop:
                # Add remaining phases as stopped
                for remaining_phase in range(phase, 10):
                    results.append({'phase': remaining_phase, 'status': 'stopped', 'success': False})
                break

            # Check if phase is enabled (default to True)
            phase_key = f'phase{phase:02d}'
            phase_config = phases_config.get(phase_key, {'enabled': True})

            if not phase_config.get('enabled', True):
                results.append({'phase': phase, 'status': 'skipped'})
                continue

            result = self._run_phase({'phase': phase, 'config': config})
            results.append(result)

            if not result['success']:
                break

        self.should_stop = False

        return {
            'success': all(r.get('success', False) or r.get('status') == 'skipped' for r in results),
            'results': results,
        }

    def _stop(self, command: dict) -> dict:
        """Stop the current execution (without rollback)."""
        self.should_stop = True
        return {'success': True, 'message': 'Stop signal sent'}

    def _stop_and_rollback(self, command: dict) -> dict:
        """Stop execution and rollback any partial changes."""
        self.should_stop = True

        rollback_result = None
        if self.rollback_manager and self._current_session_id:
            rollback_result = self.rollback_manager.rollback(self._current_session_id)
            self._current_session_id = None

        return {
            'success': True,
            'message': 'Stop signal sent with rollback',
            'rollback': rollback_result,
            'rollbackPerformed': rollback_result is not None,
        }

    def _rollback(self, command: dict) -> dict:
        """
        Manually trigger rollback for the current or specified session.
        If no session is specified and no active session exists,
        tries to find and rollback any pending session (used after crash/kill).
        """
        session_id = command.get('session_id', self._current_session_id)

        if not self.rollback_manager:
            return {'success': False, 'error': 'Rollback manager not available'}

        # If no specific session, try to find a pending one (after crash/kill)
        if not session_id:
            result = self.rollback_manager.rollback_pending()
            return {'success': result.get('success', False), 'rollback': result}

        result = self.rollback_manager.rollback(session_id)
        if session_id == self._current_session_id:
            self._current_session_id = None

        return {'success': result.get('success', False), 'rollback': result}

    def _get_status(self, command: dict) -> dict:
        """Get current pipeline status."""
        return {'success': True, 'currentPhase': self.current_phase, 'isRunning': self.current_phase is not None}

    def _validate_dataset(self, command: dict) -> dict:
        """Validate a dataset file."""
        path = command.get('path')

        if not path or not Path(path).exists():
            return {'success': False, 'error': 'File not found'}

        # Check if pandas is available
        if pd is None:
            return {'success': False, 'error': 'pandas not available. Install dependencies first.'}

        try:
            df = pd.read_csv(path)

            # Check required columns - support multiple formats
            # Only REQUIRED column: Review (or TituloReview)
            # Optional columns: Titulo, FechaEstadia, Calificacion

            has_titulo_review = 'TituloReview' in df.columns
            has_titulo = 'Titulo' in df.columns
            has_review = 'Review' in df.columns

            has_text = has_titulo_review or has_review or has_titulo

            # Determine validity: only need some form of text
            if has_text:
                missing = []
            else:
                missing = ['Review (or TituloReview)']

            # Generate preview data
            preview = df.head(5).to_dict(orient='records')

            # Convert any NaN values to None for JSON serialization
            for row in preview:
                for key, value in row.items():
                    if pd.isna(value):
                        row[key] = None

            is_valid = len(missing) == 0
            # If invalid and the file has columns, offer mapping
            needs_mapping = not is_valid and len(df.columns) > 0

            return {
                'success': True,
                'valid': is_valid,
                'rowCount': len(df),
                'columns': list(df.columns),
                'missingColumns': missing,
                'preview': preview,
                'alreadyProcessed': has_titulo_review,
                'needsMapping': needs_mapping,
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _get_required_columns(self, command: dict) -> dict:
        """Return the list of columns the system needs for the pipeline."""
        return {
            'success': True,
            'columns': [
                {
                    'name': 'Titulo',
                    'description': 'Título o encabezado de la opinión/reseña (opcional)',
                    'required': False,
                    'alternatives': ['title', 'titulo', 'header', 'subject', 'encabezado', 'nombre'],
                    'group': 'text',
                },
                {
                    'name': 'Review',
                    'description': 'Texto completo de la opinión/reseña',
                    'required': True,
                    'alternatives': [
                        'review',
                        'text',
                        'comment',
                        'opinion',
                        'comentario',
                        'descripcion',
                        'texto',
                        'reseña',
                        'contenido',
                        'body',
                    ],
                    'group': 'text',
                },
                {
                    'name': 'FechaEstadia',
                    'description': 'Fecha de la estadía o visita (opcional — formato: YYYY-MM-DD). Si no se proporciona, el análisis temporal no estará disponible.',
                    'required': False,
                    'alternatives': [
                        'date',
                        'fecha',
                        'stay_date',
                        'visit_date',
                        'fecha_visita',
                        'fecha_estadia',
                        'check_in',
                        'arrival',
                    ],
                    'group': 'metadata',
                },
                {
                    'name': 'Calificacion',
                    'description': 'Calificación numérica (1-5 estrellas) (opcional). Si no se proporciona, se generará automáticamente por el modelo de sentimientos.',
                    'required': False,
                    'alternatives': [
                        'rating',
                        'score',
                        'stars',
                        'calificacion',
                        'puntuacion',
                        'nota',
                        'estrellas',
                        'valoracion',
                    ],
                    'group': 'metadata',
                },
                {
                    'name': 'TituloReview',
                    'description': 'Texto combinado de título + reseña (alternativa a Titulo/Review por separado)',
                    'required': False,
                    'alternatives': ['full_text', 'combined_text', 'titulo_review', 'texto_completo'],
                    'group': 'text',
                },
            ],
        }

    def _apply_column_mapping(self, command: dict) -> dict:
        """
        Apply column mapping: rename user columns to system columns and save the mapped CSV.

        Expected command keys:
            path: str — source CSV file path
            mapping: dict — { systemColumnName: userColumnName | null }
        """
        source_path = command.get('path')
        mapping = command.get('mapping', {})

        if not source_path or not Path(source_path).exists():
            return {'success': False, 'error': 'Source file not found'}

        if not mapping:
            return {'success': False, 'error': 'No column mapping provided'}

        if pd is None:
            return {'success': False, 'error': 'pandas not available'}

        try:
            df = pd.read_csv(source_path)
            original_columns = list(df.columns)

            # Build rename dictionary: user_column -> system_column
            rename_map = {}
            for system_col, user_col in mapping.items():
                if user_col and user_col in df.columns:
                    # Only rename if the names are different
                    if user_col != system_col:
                        rename_map[user_col] = system_col

            # Apply renaming
            if rename_map:
                df = df.rename(columns=rename_map)

            # Validate the result has the minimum required columns
            # Only Review (or TituloReview or Titulo) is required
            has_titulo_review = 'TituloReview' in df.columns
            has_titulo = 'Titulo' in df.columns
            has_review = 'Review' in df.columns

            has_text = has_titulo_review or has_titulo or has_review

            if not has_text:
                return {
                    'success': False,
                    'error': 'La asignación debe incluir al menos una columna de texto (Review, Titulo, o TituloReview)',
                }

            # Save mapped file next to the original source file.
            # IMPORTANT: Do NOT save in python/data/ because the cleanup routine
            # (files:clean-dataset-data) deletes everything in that directory,
            # which would destroy the mapped file before Phase 1 can read it.
            source = Path(source_path)
            mapped_path = source.parent / f'{source.stem}_mapped{source.suffix}'
            df.to_csv(mapped_path, index=False)

            # Generate preview
            preview = df.head(5).to_dict(orient='records')
            for row in preview:
                for key, value in row.items():
                    if pd.isna(value):
                        row[key] = None

            logger.info(f'Column mapping applied: {rename_map}')
            logger.info(f'Original columns: {original_columns} -> Mapped columns: {list(df.columns)}')

            return {
                'success': True,
                'outputPath': str(mapped_path),
                'rowCount': len(df),
                'columns': list(df.columns),
                'preview': preview,
            }

        except Exception as e:
            logger.error(f'Column mapping failed: {e}')
            return {'success': False, 'error': str(e)}

    def _validate_phase_dependencies(self, command: dict) -> dict:
        """
        Check if a phase has all required dependencies (previous phases completed).
        Returns which columns/files are missing and which phases need to be run.
        """
        phase = command.get('phase')
        from config.config import ConfigDataset

        default_dataset = str(ConfigDataset.get_dataset_path())
        dataset_path = command.get('dataset_path', default_dataset)

        # Phase dependencies mapping
        PHASE_DEPENDENCIES = {
            1: {'name': 'Procesamiento Básico', 'required_columns': [], 'required_files': [], 'depends_on_phases': []},
            2: {
                'name': 'Estadísticas Básicas',
                'required_columns': ['TituloReview'],
                'required_files': [],
                'depends_on_phases': [1],
            },
            3: {
                'name': 'Análisis de Sentimientos',
                'required_columns': ['TituloReview'],
                'required_files': [],
                'depends_on_phases': [1],
            },
            4: {
                'name': 'Análisis de Subjetividad',
                'required_columns': ['TituloReview'],
                'required_files': [],
                'depends_on_phases': [1],
            },
            5: {
                'name': 'Clasificación de Categorías',
                'required_columns': ['TituloReview'],
                'required_files': [],
                'depends_on_phases': [1],
            },
            6: {
                'name': 'Análisis Jerárquico de Tópicos',
                'required_columns': ['TituloReview', 'Sentimiento', 'Categorias'],
                'required_files': [],
                'depends_on_phases': [1, 3, 5],
            },
            7: {
                'name': 'Resumen Inteligente',
                'required_columns': ['TituloReview', 'Sentimiento', 'Subjetividad', 'Categorias'],
                'required_files': ['data/shared/categorias_scores.json'],
                'depends_on_phases': [1, 3, 4, 5],
            },
            8: {
                'name': 'Insights Estratégicos',
                'required_columns': ['TituloReview', 'Sentimiento', 'Subjetividad', 'Categorias'],
                'required_files': ['data/shared/categorias_scores.json', 'data/shared/resumenes.json'],
                'depends_on_phases': [1, 3, 4, 5, 7],
            },
            9: {
                'name': 'Visualizaciones e Insights',
                # Phase 9 needs Phase 7 (structured summary) to generate insights_textuales.json
                # Phase 9 also needs Phase 8 (strategic insights) for complete analysis
                'required_columns': ['TituloReview', 'Sentimiento', 'Subjetividad', 'Categorias'],
                'required_files': ['data/shared/resumenes.json'],
                'depends_on_phases': [1, 3, 4, 5, 7, 8],
            },
        }

        if phase not in PHASE_DEPENDENCIES:
            return {'success': False, 'error': f'Invalid phase: {phase}'}

        deps = PHASE_DEPENDENCIES[phase]
        missing_columns = []
        missing_files = []
        missing_phases = []

        # Phase 1 doesn't require the output dataset to exist yet
        # (it creates it by copying and processing the input)
        if phase == 1:
            return {
                'success': True,
                'valid': True,
                'canRun': True,
                'missingColumns': [],
                'missingFiles': [],
                'missingPhases': [],
            }

        # Check if dataset exists at the output/working path
        if not Path(dataset_path).exists():
            return {
                'success': True,
                'valid': False,
                'error': 'Dataset no encontrado. Por favor carga un archivo CSV primero.',
                'missingColumns': [],
                'missingFiles': [],
                'missingPhases': deps['depends_on_phases'],
                'canRun': False,
            }

        try:
            # Check required columns
            if deps['required_columns']:
                df = pd.read_csv(dataset_path)
                for col in deps['required_columns']:
                    if col not in df.columns:
                        missing_columns.append(col)

            # Check required files (resolve paths relative to dataset directory)
            dataset_dir = Path(dataset_path).parent
            for file_path in deps['required_files']:
                # If path starts with data/, resolve relative to dataset directory
                if file_path.startswith('data/'):
                    # Remove 'data/' prefix and resolve from dataset parent
                    relative_path = file_path.replace('data/', '', 1)
                    full_path = dataset_dir / relative_path
                else:
                    full_path = Path(file_path)

                if not full_path.exists():
                    missing_files.append(file_path)

            # Determine missing phases based on missing columns/files
            if missing_columns or missing_files:
                # Map columns to phases
                column_to_phase = {'TituloReview': 1, 'Sentimiento': 3, 'Subjetividad': 4, 'Categorias': 5, 'Topico': 6}

                for col in missing_columns:
                    phase_num = column_to_phase.get(col)
                    if phase_num and phase_num not in missing_phases:
                        missing_phases.append(phase_num)

                # If files are missing, add their respective phases
                if 'categorias_embeddings.pkl' in str(missing_files):
                    if 5 not in missing_phases:
                        missing_phases.append(5)
                if 'categorias_scores.json' in str(missing_files):
                    if 5 not in missing_phases:
                        missing_phases.append(5)

            # Build user-friendly message
            can_run = len(missing_columns) == 0 and len(missing_files) == 0
            error_message = None

            if not can_run:
                phase_names = {
                    1: 'Fase 1: Procesamiento Básico',
                    2: 'Fase 2: Estadísticas Básicas',
                    3: 'Fase 3: Análisis de Sentimientos',
                    4: 'Fase 4: Análisis de Subjetividad',
                    5: 'Fase 5: Clasificación de Categorías',
                    6: 'Fase 6: Análisis de Tópicos',
                }

                missing_phase_names = [phase_names[p] for p in sorted(missing_phases) if p in phase_names]

                if missing_phase_names:
                    error_message = 'Esta fase requiere que ejecutes primero:\n\n' + '\n'.join(
                        f'• {name}' for name in missing_phase_names
                    )
                else:
                    error_message = 'Faltan datos necesarios para ejecutar esta fase.'

            return {
                'success': True,
                'valid': can_run,
                'canRun': can_run,
                'missingColumns': missing_columns,
                'missingFiles': missing_files,
                'missingPhases': sorted(missing_phases),
                'error': error_message,
            }

        except Exception as e:
            return {'success': False, 'error': f'Error validating dependencies: {e!s}'}

    def _get_llm_info(self, command: dict) -> dict:
        """Get LLM configuration info."""
        try:
            # Try to get info from LLMProvider if method exists
            if hasattr(LLMProvider, 'get_info'):
                info = LLMProvider.get_info()
                return {'success': True, **info}
            # Return basic info from config
            from config.config import ConfigLLM
            model = getattr(ConfigLLM, 'OLLAMA_MODEL', '') or 'unknown'
            return {'success': True, 'provider': 'ollama', 'model': model, 'configured': bool(model and model != 'unknown')}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _check_ollama(self, command: dict) -> dict:
        """Check Ollama availability."""
        try:
            import requests

            response = requests.get('http://localhost:11434/api/tags', timeout=5)
            if response.ok:
                data = response.json()
                return {'success': True, 'running': True, 'models': [m['name'] for m in data.get('models', [])]}
            return {'success': True, 'running': False, 'models': []}
        except Exception:
            return {'success': True, 'running': False, 'models': []}

    def _get_local_cache_dir(self) -> str:
        """Get the local models cache directory path."""
        from config.config import ConfigDataset

        return ConfigDataset.get_models_cache_dir()

    def _check_models_status(self, command: dict) -> dict:
        """Check which ML models are already downloaded in local cache."""
        status = {
            'sentiment': False,
            'embeddings': False,
            'subjectivity': False,
            'categories': False,
        }

        try:
            self._get_local_cache_dir()

            # Check local cache directory for each model
            status['sentiment'] = self._is_model_cached('nlptown/bert-base-multilingual-uncased-sentiment')
            status['embeddings'] = self._is_model_cached('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
            status['subjectivity'] = self._is_model_cached('victorwkey/tourism-subjectivity-bert')
            status['categories'] = self._is_model_cached('victorwkey/tourism-categories-bert')

        except Exception as e:
            print(json.dumps({'type': 'error', 'message': f'Error checking models: {e!s}'}), flush=True)

        return {'success': True, 'status': status}

    def _preload_models(self, command: dict) -> dict:
        """Load already-downloaded models into memory for faster pipeline execution.

        This method is interruptible: between each model load, it checks for
        pending commands on stdin and processes them first (cooperative multitasking).
        This prevents long model loads from blocking fast operations like dataset
        validation or health checks.
        """
        results = {
            'sentiment': False,
            'embeddings': False,
            'subjectivity': False,
            'categories': False,
        }

        cache_dir = self._get_local_cache_dir()

        # First check which models are actually downloaded
        status_result = self._check_models_status({})
        status = status_result.get('status', {})

        models_to_load = []
        if status.get('sentiment'):
            models_to_load.append(('sentiment', 'nlptown/bert-base-multilingual-uncased-sentiment', 'transformers'))
        if status.get('embeddings'):
            models_to_load.append(
                ('embeddings', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', 'sentence-transformers')
            )
        if status.get('subjectivity'):
            models_to_load.append(('subjectivity', 'victorwkey/tourism-subjectivity-bert', 'transformers'))
        if status.get('categories'):
            models_to_load.append(('categories', 'victorwkey/tourism-categories-bert', 'transformers'))

        if not models_to_load:
            return {'success': True, 'details': results, 'message': 'No downloaded models to preload'}

        total = len(models_to_load)
        for i, (key, model_name, model_type) in enumerate(models_to_load):
            # --- Cooperative multitasking: process any pending commands before each model load ---
            self._process_pending_stdin_commands()

            try:
                progress_pct = int((i / total) * 100)
                print(
                    json.dumps(
                        {
                            'type': 'progress',
                            'subtype': 'model_preload',
                            'model': key,
                            'progress': progress_pct,
                            'message': f'Loading {key} into memory...',
                        }
                    ),
                    flush=True,
                )

                if model_type == 'transformers':
                    from transformers import AutoModelForSequenceClassification, AutoTokenizer

                    AutoTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
                    AutoModelForSequenceClassification.from_pretrained(model_name, cache_dir=cache_dir)
                elif model_type == 'sentence-transformers':
                    from sentence_transformers import SentenceTransformer

                    SentenceTransformer(model_name, cache_folder=cache_dir)

                results[key] = True

                print(
                    json.dumps(
                        {
                            'type': 'progress',
                            'subtype': 'model_preload',
                            'model': key,
                            'progress': int(((i + 1) / total) * 100),
                            'message': f'{key} loaded',
                        }
                    ),
                    flush=True,
                )

            except Exception as e:
                logger.warning(f'Failed to preload model {key}: {e}')
                results[key] = False

        return {'success': True, 'details': results}

    def _process_pending_stdin_commands(self):
        """Process any commands waiting on stdin without blocking.

        This enables cooperative multitasking during long operations like
        model preloading. It uses select() to check if stdin has data
        available, and processes all waiting commands before returning.
        """
        import select
        import sys as _sys

        while True:
            # Check if stdin has data available (non-blocking)
            # On Windows, select() doesn't work on stdin, so we use msvcrt
            has_data = False
            if _sys.platform == 'win32':
                import msvcrt

                has_data = msvcrt.kbhit()
                if not has_data:
                    # On Windows with piped stdin, kbhit() may not work;
                    # use a thread-based peek with a very short timeout
                    try:
                        import threading

                        result = [None]

                        def try_read(_result=result):
                            # Peek at stdin buffer
                            try:
                                import ctypes

                                kernel32 = ctypes.windll.kernel32
                                handle = kernel32.GetStdHandle(-10)  # STD_INPUT_HANDLE
                                bytes_available = ctypes.c_ulong(0)
                                # PeekNamedPipe returns True if there's data
                                peek_ok = kernel32.PeekNamedPipe(
                                    handle, None, 0, None, ctypes.byref(bytes_available), None
                                )
                                _result[0] = peek_ok and bytes_available.value > 0
                            except Exception:
                                _result[0] = False

                        t = threading.Thread(target=try_read, daemon=True)
                        t.start()
                        t.join(timeout=0.05)  # 50ms peek timeout
                        has_data = result[0] is True
                    except Exception:
                        has_data = False
            else:
                # Unix: use select with 0 timeout (non-blocking)
                readable, _, _ = select.select([_sys.stdin], [], [], 0)
                has_data = bool(readable)

            if not has_data:
                break

            try:
                line = _sys.stdin.readline().strip()
                if not line:
                    break

                cmd = json.loads(line)
                call_id = cmd.get('_callId')
                logger.info(f'Processing interleaved command: {cmd.get("action")} (callId={call_id})')

                result = self.execute(cmd)
                if call_id is not None:
                    result['_callId'] = call_id
                print(json.dumps(result), flush=True)

            except Exception as e:
                logger.error(f'Error processing interleaved command: {e}')
                break

    def _download_models(self, command: dict) -> dict:
        """Download required HuggingFace models with progress tracking."""
        import sys

        results = {
            'sentiment': False,
            'embeddings': False,
            'subjectivity': False,
            'categories': False,
        }

        errors = {}

        # All models are now downloaded from HuggingFace
        # Order: sentiment, embeddings, subjectivity, categories
        models_to_download = [
            ('sentiment', 'nlptown/bert-base-multilingual-uncased-sentiment', 'transformers', 669),
            ('embeddings', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', 'sentence-transformers', 471),
            ('subjectivity', 'victorwkey/tourism-subjectivity-bert', 'transformers', 669),
            ('categories', 'victorwkey/tourism-categories-bert', 'transformers', 669),
        ]

        # Custom progress callback class for HuggingFace downloads
        class ProgressCallback:
            def __init__(self, model_key: str, model_name: str, total_mb: int):
                self.model_key = model_key
                self.model_name = model_name
                self.total_mb = total_mb
                self.current_file = ''
                self.files_downloaded = 0
                self.total_files = 0
                self.last_progress = 0

            def report_progress(self, progress: int, message: str):
                # Only report if progress changed significantly (avoid flooding)
                if progress != self.last_progress or progress == 0 or progress == 100:
                    self.last_progress = progress
                    # Save and restore stdout to ensure JSON goes to real stdout
                    old_stdout = sys.stdout
                    sys.stdout = sys.__stdout__
                    print(
                        json.dumps(
                            {
                                'type': 'progress',
                                'subtype': 'model_download',
                                'model': self.model_key,
                                'progress': progress,
                                'message': message,
                            }
                        ),
                        flush=True,
                    )
                    sys.stdout = old_stdout

        cache_dir = self._get_local_cache_dir()

        for key, model_name, model_type, size_mb in models_to_download:
            callback = ProgressCallback(key, model_name, size_mb)

            try:
                # Check if already downloaded locally
                is_cached = self._is_model_cached(model_name)

                if is_cached:
                    # Report 100% immediately for already-downloaded models
                    callback.report_progress(100, 'Already downloaded')
                    results[key] = True
                    continue

                # Report start for new downloads
                callback.report_progress(0, 'Starting download...')

                # Redirect stdout to stderr during downloads to prevent
                # library print statements from corrupting the JSON stream
                with redirect_stdout_to_stderr():
                    # Download model into local cache directory
                    if model_type == 'transformers':
                        try:
                            from transformers import AutoModelForSequenceClassification, AutoTokenizer

                            # Stage 1: Download tokenizer (small, ~5%)
                            callback.report_progress(5, 'Downloading tokenizer...')
                            AutoTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
                            callback.report_progress(15, 'Tokenizer downloaded')

                            # Stage 2: Download model (large, ~85%)
                            callback.report_progress(20, f'Downloading model weights (~{size_mb} MB)...')
                            AutoModelForSequenceClassification.from_pretrained(model_name, cache_dir=cache_dir)
                            callback.report_progress(100, f'{model_name} downloaded')

                        except ImportError as ie:
                            callback.report_progress(-1, f'transformers package not installed: {ie}')
                            errors[key] = str(ie)
                            continue

                    elif model_type == 'sentence-transformers':
                        try:
                            from sentence_transformers import SentenceTransformer

                            # Stage 1: Start download
                            callback.report_progress(10, f'Downloading model (~{size_mb} MB)...')

                            # Stage 2: Download model into local cache
                            SentenceTransformer(model_name, cache_folder=cache_dir)
                            callback.report_progress(100, f'{model_name} downloaded')

                        except ImportError as ie:
                            callback.report_progress(-1, f'sentence-transformers package not installed: {ie}')
                            errors[key] = str(ie)
                            continue

                results[key] = True

            except Exception as e:
                results[key] = False
                errors[key] = str(e)
                callback.report_progress(-1, str(e))

        all_ok = all(results.values())
        response = {'success': all_ok, 'details': results}
        if not all_ok and errors:
            response['error'] = '; '.join(f'{k}: {v}' for k, v in errors.items())
        return response

    def _is_model_cached(self, model_name: str) -> bool:
        """Check if a model is already downloaded in the local cache directory."""
        try:
            cache_dir = Path(self._get_local_cache_dir())
            safe_name = model_name.replace('/', '--')
            model_dir = cache_dir / f'models--{safe_name}'
            if not model_dir.exists():
                return False
            # Verify it has actual snapshot content (not just an empty dir)
            snapshots_dir = model_dir / 'snapshots'
            if snapshots_dir.exists() and any(snapshots_dir.iterdir()):
                return True
            return False
        except Exception:
            return False

    def _download_model(self, command: dict) -> dict:
        """Download a specific model into local cache."""
        model_key = command.get('model')

        model_map = {
            'sentiment': ('nlptown/bert-base-multilingual-uncased-sentiment', 'transformers'),
            'embeddings': ('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', 'sentence-transformers'),
            'subjectivity': ('victorwkey/tourism-subjectivity-bert', 'transformers'),
            'categories': ('victorwkey/tourism-categories-bert', 'transformers'),
        }

        if model_key not in model_map:
            return {'success': False, 'error': f'Unknown model: {model_key}'}

        model_name, model_type = model_map[model_key]
        cache_dir = self._get_local_cache_dir()

        try:
            if model_type == 'transformers':
                from transformers import AutoModelForSequenceClassification, AutoTokenizer

                AutoTokenizer.from_pretrained(model_name, cache_dir=cache_dir)
                AutoModelForSequenceClassification.from_pretrained(model_name, cache_dir=cache_dir)
            elif model_type == 'sentence-transformers':
                from sentence_transformers import SentenceTransformer

                SentenceTransformer(model_name, cache_folder=cache_dir)

            return {'success': True, 'model': model_key}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _get_download_size(self, command: dict) -> dict:
        """Get total download size for models."""
        # Estimated sizes in MB
        sizes = {
            'sentiment': 420,
            'embeddings': 80,
            'subjectivity': 440,
            'categories': 440,
        }

        # Check what's already downloaded
        status_result = self._check_models_status({})
        status = status_result.get('status', {})

        total_size = sum(size for key, size in sizes.items() if not status.get(key, False))

        return {'success': True, 'size_mb': total_size}


def main():
    """Main entry point for subprocess communication."""
    api = PipelineAPI()

    # Cleanup old backup sessions on startup
    if api.rollback_manager:
        cleaned = api.rollback_manager.cleanup_old_backups(max_age_hours=24)
        if cleaned > 0:
            print(json.dumps({'type': 'info', 'message': f'Cleaned up {cleaned} old backup session(s)'}), flush=True)

    # Send ready signal
    print(json.dumps({'type': 'ready', 'status': 'initialized'}), flush=True)

    # Read commands from stdin, write responses to stdout
    # Each command may contain a _callId for response correlation
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            command = json.loads(line)
            call_id = command.get('_callId')  # correlation ID from TypeScript bridge
            result = api.execute(command)
            # Echo back the call ID so TypeScript can match the response
            if call_id is not None:
                result['_callId'] = call_id
            print(json.dumps(result), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({'success': False, 'error': f'Invalid JSON: {e}'}), flush=True)


if __name__ == '__main__':
    main()
