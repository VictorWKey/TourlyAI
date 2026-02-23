"""
Fase 08: Strategic Insights Generation
=======================================
Generates a single comprehensive strategic insight by combining:
- All dataset statistics and metrics (sentiment, subjectivity, categories, topics, etc.)
- The structured summary from Phase 07
- KPIs, strengths, weaknesses, and validation data

Uses a single LLM call to produce a professional, data-driven strategic analysis
with actionable recommendations for tourism decision-makers.
"""

import ast
import json
import logging
import os
import threading
import time
import warnings
from collections import Counter, defaultdict
from collections.abc import Callable
from datetime import datetime
from typing import Any

import pandas as pd

from .llm_provider import crear_chain, get_llm
from .llm_utils import RetryConfig

warnings.filterwarnings('ignore')

logger = logging.getLogger(__name__)


class GeneradorInsightsEstrategicos:
    """
    Generates a single comprehensive strategic insight by synthesizing all pipeline data:
    - Dataset statistics (Phase 02)
    - Sentiment distribution (Phase 03)
    - Subjectivity distribution (Phase 04)
    - Category classification (Phase 05)
    - Hierarchical topics (Phase 06)
    - Structured summary (Phase 07)

    Produces one holistic strategic analysis via a single LLM call.
    """

    def __init__(self, progress_callback: Callable[[int, str], None] | None = None):
        from config.config import ConfigDataset

        self.dataset_path = str(ConfigDataset.get_dataset_path())
        self.shared_dir = ConfigDataset.get_shared_dir()
        self.scores_path = str(self.shared_dir / 'categorias_scores.json')
        self.resumenes_path = self.shared_dir / 'resumenes.json'
        self.output_path = self.shared_dir / 'insights_estrategicos.json'

        self.df = None
        self.scores = None
        self.structured_summary = None
        self.llm = None
        self.progress_callback = progress_callback
        self._llm_in_progress = False
        self._llm_progress_thread = None

    # ── Data Loading ─────────────────────────────────────────────────

    def _report_progress(self, progress: int, message: str = ''):
        """Report progress if callback is available."""
        if self.progress_callback:
            self.progress_callback(progress, message)

    def _simulate_llm_progress(self, start_pct: int, end_pct: int, duration_seconds: float = 30):
        """Simulate progress during LLM call by gradually updating from start_pct to end_pct."""
        self._llm_in_progress = True
        steps = 20  # Update progress 20 times
        interval = duration_seconds / steps
        progress_increment = (end_pct - start_pct) / steps

        for i in range(steps):
            if not self._llm_in_progress:
                break
            time.sleep(interval)
            current_progress = int(start_pct + (progress_increment * (i + 1)))
            self._report_progress(current_progress, 'Generando insights estratégicos con LLM...')

    def _cargar_datos(self):
        """Load the enriched dataset and all supporting data."""
        self._report_progress(5, 'Cargando dataset...')

        if not os.path.exists(self.dataset_path):
            raise FileNotFoundError(f'Dataset not found: {self.dataset_path}')

        self.df = pd.read_csv(self.dataset_path)

        required = ['TituloReview', 'Sentimiento', 'Subjetividad']
        missing = [c for c in required if c not in self.df.columns]
        if missing:
            raise KeyError(
                f'Required columns missing: {", ".join(missing)}\n   Ensure Phases 01, 03 and 04 have been executed.'
            )

        # Load category scores
        if os.path.exists(self.scores_path):
            with open(self.scores_path, encoding='utf-8') as f:
                self.scores = json.load(f)
        else:
            self.scores = {}

        # Load structured summary from Phase 07
        if self.resumenes_path.exists():
            with open(self.resumenes_path, encoding='utf-8') as f:
                data = json.load(f)
            resumenes = data.get('resumenes', {})
            self.structured_summary = resumenes.get('estructurado', None)
        else:
            self.structured_summary = None

        print(f'   • Dataset loaded: {len(self.df)} reviews')
        print(f'   • Category scores: {len(self.scores)} records')
        print(f'   • Structured summary: {"available" if self.structured_summary else "not available"}')

        self._report_progress(15, 'Dataset cargado correctamente')

    # ── Metrics Compilation ──────────────────────────────────────────

    def _compile_all_metrics(self) -> str:
        """
        Compile ALL statistics and metrics into a formatted markdown context
        that mirrors (and extends) what the Metrics screen displays.
        """
        self._report_progress(20, 'Compilando métricas y estadísticas...')

        total = len(self.df)
        sections: list[str] = []

        # ── 1. Overview KPIs ──
        pct_pos = round((self.df['Sentimiento'] == 'Positivo').sum() / total * 100, 1)
        pct_neu = round((self.df['Sentimiento'] == 'Neutro').sum() / total * 100, 1)
        pct_neg = round((self.df['Sentimiento'] == 'Negativo').sum() / total * 100, 1)
        avg_rating = round(float(self.df['Calificacion'].mean()), 2) if 'Calificacion' in self.df.columns else 'N/A'
        median_rating = float(self.df['Calificacion'].median()) if 'Calificacion' in self.df.columns else 'N/A'

        sections.append(
            f'## Overview KPIs\n'
            f'| Metric | Value |\n|---|---|\n'
            f'| Total Reviews | {total} |\n'
            f'| Positive Sentiment | {pct_pos}% |\n'
            f'| Neutral Sentiment | {pct_neu}% |\n'
            f'| Negative Sentiment | {pct_neg}% |\n'
            f'| Avg Rating | {avg_rating} / 5 |\n'
            f'| Median Rating | {median_rating} |'
        )

        # ── 2. Sentiment Distribution ──
        sent_counts = self.df['Sentimiento'].value_counts()
        rows = []
        for label in ['Positivo', 'Neutro', 'Negativo']:
            cnt = int(sent_counts.get(label, 0))
            pct = round(cnt / total * 100, 1) if total else 0
            rows.append(f'| {label} | {cnt} | {pct}% |')
        sections.append(
            '## Sentiment Distribution\n| Sentiment | Count | Percentage |\n|---|---|---|\n' + '\n'.join(rows)
        )

        # ── 3. Subjectivity Distribution ──
        if 'Subjetividad' in self.df.columns:
            subj_counts = self.df['Subjetividad'].value_counts()
            rows = []
            for label in sorted(subj_counts.index):
                cnt = int(subj_counts.get(label, 0))
                pct = round(cnt / total * 100, 1) if total else 0
                rows.append(f'| {label} | {cnt} | {pct}% |')
            sections.append(
                '## Subjectivity Distribution\n| Type | Count | Percentage |\n|---|---|---|\n' + '\n'.join(rows)
            )

        # ── 4. Rating Distribution ──
        if 'Calificacion' in self.df.columns:
            cal_counts = self.df['Calificacion'].value_counts().sort_index()
            rows = []
            for k, v in cal_counts.items():
                cnt = int(v)
                pct = round(cnt / total * 100, 1) if total else 0
                rows.append(f'| {int(k)} stars | {cnt} | {pct}% |')
            sections.append(
                '## Rating Distribution\n'
                '| Rating | Count | Percentage |\n|---|---|---|\n'
                + '\n'.join(rows)
                + f'\n\nAvg: {avg_rating}, Median: {median_rating}'
            )

        # ── 5. Category Distribution & Sentiment per Category ──
        if 'Categorias' in self.df.columns:
            cat_counter: Counter = Counter()
            cat_sentimientos: dict[str, dict[str, int]] = defaultdict(
                lambda: {'Positivo': 0, 'Neutro': 0, 'Negativo': 0}
            )

            for _, row in self.df.iterrows():
                try:
                    cats_raw = str(row['Categorias']).strip()
                    if cats_raw in ['[]', '{}', '', 'nan', 'None']:
                        continue
                    cats_list = (
                        ast.literal_eval(cats_raw)
                        if cats_raw.startswith('[')
                        else [c.strip() for c in cats_raw.split(',') if c.strip()]
                    )
                    sentiment = row['Sentimiento']
                    cat_counter.update(cats_list)
                    for cat in cats_list:
                        cat_sentimientos[cat][sentiment] += 1
                except Exception:
                    continue

            total_assignments = sum(cat_counter.values())
            cats_per_review = round(total_assignments / total, 2) if total else 0

            rows = []
            for cat, count in cat_counter.most_common():
                pct = round(count / total * 100, 1)
                rows.append(f'| {cat} | {count} | {pct}% |')
            sections.append(
                f'## Category Distribution\n'
                f'Categories per review (avg): {cats_per_review} | Unique categories: {len(cat_counter)} | Total assignments: {total_assignments}\n\n'
                f'| Category | Reviews | Percentage |\n|---|---|---|\n' + '\n'.join(rows)
            )

            # Sentiment per category (strengths & weaknesses)
            rows_strength = []
            rows_weakness = []
            for cat in cat_counter:
                s = cat_sentimientos[cat]
                cat_total = sum(s.values())
                if cat_total < 3:
                    continue
                pct_p = round(s['Positivo'] / cat_total * 100, 1)
                pct_n = round(s['Negativo'] / cat_total * 100, 1)
                rows_strength.append((cat, pct_p, cat_total))
                rows_weakness.append((cat, pct_n, cat_total))

            rows_strength.sort(key=lambda x: x[1], reverse=True)
            rows_weakness.sort(key=lambda x: x[1], reverse=True)

            strength_rows = [f'| {cat} | {pct}% | {tot} |' for cat, pct, tot in rows_strength[:10]]
            weakness_rows = [f'| {cat} | {pct}% | {tot} |' for cat, pct, tot in rows_weakness[:10]]

            sections.append(
                '## Strengths (Top Categories by Positive Sentiment)\n'
                '| Category | % Positive | Total Mentions |\n|---|---|---|\n' + '\n'.join(strength_rows)
            )
            sections.append(
                '## Weaknesses (Top Categories by Negative Sentiment)\n'
                '| Category | % Negative | Total Mentions |\n|---|---|---|\n' + '\n'.join(weakness_rows)
            )

        # ── 6. Top Sub-topics ──
        if 'Topico' in self.df.columns:
            subtopic_counter: Counter = Counter()
            subtopic_sentiment: dict[str, dict[str, int]] = defaultdict(
                lambda: {'Positivo': 0, 'Neutro': 0, 'Negativo': 0}
            )

            for _, row in self.df.iterrows():
                try:
                    topico_str = str(row.get('Topico', '')).strip()
                    if topico_str in ['{}', 'nan', 'None', '']:
                        continue
                    topico_dict = ast.literal_eval(topico_str)
                    sentiment = row['Sentimiento']
                    for subtopic in topico_dict.values():
                        if subtopic:
                            subtopic_counter[subtopic] += 1
                            subtopic_sentiment[subtopic][sentiment] += 1
                except Exception:
                    continue

            if subtopic_counter:
                rows = []
                for name, count in subtopic_counter.most_common(20):
                    pct = round(count / total * 100, 1)
                    s = subtopic_sentiment[name]
                    stotal = sum(s.values())
                    pct_p = round(s['Positivo'] / stotal * 100, 1) if stotal else 0
                    pct_n = round(s['Negativo'] / stotal * 100, 1) if stotal else 0
                    rows.append(f'| {name} | {count} | {pct}% | {pct_p}% | {pct_n}% |')
                sections.append(
                    '## Top Sub-topics\n'
                    '| Sub-topic | Mentions | % of Total | % Positive | % Negative |\n|---|---|---|---|---|\n'
                    + '\n'.join(rows)
                )

        # ── 7. Temporal Analysis ──
        if 'FechaEstadia' in self.df.columns:
            fechas = pd.to_datetime(self.df['FechaEstadia'], errors='coerce').dropna()
            if len(fechas) > 0:
                sections.append(
                    f'## Temporal Analysis\n'
                    f'| Metric | Value |\n|---|---|\n'
                    f'| Date Range | {fechas.min().strftime("%Y-%m-%d")} to {fechas.max().strftime("%Y-%m-%d")} |\n'
                    f'| Total Days | {(fechas.max() - fechas.min()).days} |\n'
                    f'| Reviews with Date | {len(fechas)} |\n'
                    f'| Reviews without Date | {total - len(fechas)} |'
                )

        # ── 8. Text Length Statistics ──
        if 'TituloReview' in self.df.columns:
            lengths = self.df['TituloReview'].dropna().str.len()
            if len(lengths) > 0:
                sections.append(
                    f'## Review Text Length\n'
                    f'| Metric | Value |\n|---|---|\n'
                    f'| Average | {int(lengths.mean())} chars |\n'
                    f'| Median | {int(lengths.median())} chars |\n'
                    f'| Min | {int(lengths.min())} chars |\n'
                    f'| Max | {int(lengths.max())} chars |'
                )

        self._report_progress(30, 'Métricas compiladas')

        return '\n\n'.join(sections)

    def _compile_structured_summary(self) -> str:
        """Format the structured summary for LLM context."""
        self._report_progress(35, 'Preparando resumen estructurado...')

        if not self.structured_summary:
            return '(No structured summary available from Phase 07)'

        parts = []

        # Global summary
        if self.structured_summary.get('global'):
            parts.append(f'### Global Structured Summary\n{self.structured_summary["global"]}')

        # Per-category summaries
        if self.structured_summary.get('por_categoria'):
            for cat, text in self.structured_summary['por_categoria'].items():
                parts.append(f'### Category: {cat}\n{text}')

        return '\n\n'.join(parts) if parts else '(Structured summary is empty)'

    # ── LLM Invocation ───────────────────────────────────────────────

    def _inicializar_llm(self):
        """Initialize the LLM provider."""
        self._report_progress(40, 'Inicializando LLM...')
        self.llm = get_llm()
        self._report_progress(45, 'LLM inicializado')

    def _invocar_llm_con_retry(
        self, template: str, input_data: dict, max_retries: int = 3, descripcion: str = 'LLM operation'
    ) -> str:
        """Invoke LLM with retry logic."""
        from .llm_utils import is_openai_quota_error

        config = RetryConfig(max_retries=max_retries)
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                chain = crear_chain(template)
                result = chain.invoke(input_data)

                if result and str(result).strip():
                    return str(result)

                raise ValueError('Empty LLM response')

            except Exception as e:
                # Don't retry non-transient errors (quota/billing)
                if is_openai_quota_error(e):
                    logger.error(
                        f'OpenAI quota exhausted for {descripcion}. '
                        'Add funds at https://platform.openai.com/account/billing'
                    )
                    raise RuntimeError(
                        'OPENAI_QUOTA_EXHAUSTED: Tu API key de OpenAI no tiene créditos disponibles. '
                        'Agrega fondos en https://platform.openai.com/account/billing '
                        'o cambia al modo de IA local (Ollama) en la configuración.'
                    ) from e

                last_error = e
                logger.warning(f'Attempt {attempt + 1}/{max_retries + 1} failed for {descripcion}: {str(e)[:100]}')
                if attempt < max_retries:
                    pass  # retry immediately

        logger.error(f'All retries exhausted for {descripcion}: {last_error}')
        return ''

    # ── Insight Generation ───────────────────────────────────────────

    def _generar_insight_global(
        self,
        metrics_context: str,
        summary_context: str,
    ) -> str:
        """Generate a single comprehensive strategic insight report."""
        analysis_language = os.environ.get('ANALYSIS_LANGUAGE', 'es')

        if analysis_language == 'en':
            template = """You are a chief tourism strategy officer producing the executive strategic report for a destination.

## COMPLETE DATASET METRICS AND STATISTICS
{metricas}

## STRUCTURED SUMMARY (ALL CATEGORIES)
{resumen_estructurado}

CRITICAL INSTRUCTIONS:
1. ONLY use data from the metrics above - NEVER invent or assume numbers
2. EVERY claim must cite specific percentages, counts, or ratings from the data
3. If a metric isn't in the data, DO NOT mention it
4. Extract actual baseline values from the metrics for KPI recommendations

EXAMPLE OF GOOD DATA-DRIVEN WRITING (these are FICTIONAL examples of STYLE ONLY — do NOT use these numbers, use the ACTUAL metrics above):
❌ BAD: "The destination shows positive sentiment"
✅ GOOD: "[actual_%_positive] of reviews express positive sentiment ([actual_count] of [actual_total] total reviews)"

❌ BAD: "Food is a competitive advantage"
✅ GOOD: "[Category] leads with [actual_%]% positive sentiment ([actual_mentions] mentions, avg rating [actual_rating]/5)"

Synthesize ALL the above data into a comprehensive STRATEGIC INSIGHTS REPORT (800-1200 words).

FORMAT YOUR REPORT WITH RICH MARKDOWN — follow this structure EXACTLY:

## 📊 Executive Summary

Start with exact numbers: "Analysis of [X] reviews shows [Y%] positive, [Z%] negative sentiment..."
Include: total reviews, sentiment breakdown (%), average rating from the data.
NO generic statements — only data-backed observations. Write 2-3 impactful sentences.

---

## 📈 Overall Performance Dashboard

Provide a structured overview:
- **Sentiment Health:** State exact % positive, neutral, negative
- **Ratings Overview:** State actual avg and median ratings from the metrics
- **Subjectivity Profile:** State actual distribution % from the data
- **Sentiment-Rating Alignment:** Compare sentiment % vs rating patterns with specific numbers

---

## 🔍 Cross-Category Strategic Analysis

For EACH category mentioned, use this format:

### 🏆 Top Strengths
Rank top 3 categories by positive sentiment %:
- **[Category]** — X% positive sentiment, Y mentions, Z avg rating. Brief insight.
- **[Category]** — X% positive, Y mentions. Brief insight.
- **[Category]** — X% positive, Y mentions. Brief insight.

### ⚠️ Key Weaknesses
Rank top 3 categories by negative sentiment %:
- **[Category]** — X% negative sentiment, Y mentions. Brief insight.
- **[Category]** — X% negative, Y mentions. Brief insight.

---

## 🎯 Priority Action Matrix

Use urgency levels with data backing:
- **🔴 URGENT:** "Address [Category] — only [X%] positive sentiment with [Y] negative mentions"
- **🟡 HIGH:** "Improve [Category] — [X%] negative rate, [Y] mentions flagged"
- **🟢 MONITOR:** "Track [Category] — currently stable at [X%] positive"

---

## ⚡ Risk Register

Each risk must cite specific metrics:
- **Risk:** "[Category] dissatisfaction" — Evidence: [X%] negative, [Y] mentions, [Z]/5 rating
- **Risk:** "[Category] concern" — Evidence: specific numbers from data

---

## 📋 KPI Dashboard Recommendations

For EACH recommended KPI:
- **KPI:** "[Metric name]"
  - 📍 Baseline: [X%] *(from current dataset)*
  - 🎯 Target: [X+improvement%]
  - 📅 Timeframe: suggested period

CRITICAL FORMATTING RULES:
- Use ## for major sections and ### for subsections
- Include --- (horizontal rules) between EVERY major section
- Use **bold** for all key terms and category names
- Use bullet points (- ) for all lists
- Use emoji indicators for section headers as shown above
- Leave blank lines between sections for visual breathing room
- This is a board-level strategic document — executive-report tone with precise data

## ⚠️ KEY METRICS REMINDER — USE THESE EXACT NUMBERS:
{resumen_kpis}

Do NOT invent numbers. Use ONLY the metrics shown above."""
        else:
            template = """Eres el director de estrategia turística produciendo el reporte estratégico ejecutivo para un destino.

## MÉTRICAS Y ESTADÍSTICAS COMPLETAS DEL DATASET
{metricas}

## RESUMEN ESTRUCTURADO (TODAS LAS CATEGORÍAS)
{resumen_estructurado}

INSTRUCCIONES CRÍTICAS:
1. SOLO usa datos de las métricas anteriores - NUNCA inventes o asumas números
2. CADA afirmación debe citar porcentajes, conteos o calificaciones específicas de los datos
3. Si una métrica no está en los datos, NO la menciones
4. Extrae valores base reales de las métricas para las recomendaciones de KPIs

EJEMPLO DE BUENA ESCRITURA BASADA EN DATOS (estos son ejemplos FICTICIOS solo de ESTILO — NO uses estos números, usa las MÉTRICAS REALES de arriba):
❌ MAL: "El destino muestra sentimiento positivo"
✅ BIEN: "[%_real_positivo] de las reseñas expresan sentimiento positivo ([conteo_real] de [total_real] reseñas totales)"

❌ MAL: "La comida es una ventaja competitiva"
✅ BIEN: "[Categoría] lidera con [%_real]% de sentimiento positivo ([menciones_reales] menciones, calificación promedio [calificación_real]/5)"

Sintetiza TODOS los datos anteriores en un REPORTE DE INSIGHTS ESTRATÉGICOS integral (800-1200 palabras).

FORMATEA TU REPORTE CON MARKDOWN RICO — sigue esta estructura EXACTAMENTE:

## 📊 Resumen Ejecutivo

Inicia con números exactos: "Análisis de [X] reseñas muestra [Y%] positivas, [Z%] negativas..."
Incluye: total de reseñas, desglose de sentimiento (%), calificación promedio de los datos.
SIN declaraciones genéricas — solo observaciones respaldadas por datos. Escribe 2-3 oraciones de impacto.

---

## 📈 Panel de Rendimiento General

Proporciona un panorama estructurado:
- **Salud del Sentimiento:** Indica % exacto positivo, neutral, negativo
- **Calificaciones:** Indica promedio y mediana reales de las métricas
- **Perfil de Subjetividad:** Indica distribución % real de los datos
- **Alineación Sentimiento-Calificación:** Compara % de sentimiento vs patrones de calificación con números específicos

---

## 🔍 Análisis Estratégico Transversal

Para CADA categoría mencionada, usa este formato:

### 🏆 Principales Fortalezas
Clasifica top 3 categorías por % sentimiento positivo:
- **[Categoría]** — X% sentimiento positivo, Y menciones, Z calificación promedio. Breve insight.
- **[Categoría]** — X% positivo, Y menciones. Breve insight.
- **[Categoría]** — X% positivo, Y menciones. Breve insight.

### ⚠️ Debilidades Clave
Clasifica top 3 categorías por % sentimiento negativo:
- **[Categoría]** — X% sentimiento negativo, Y menciones. Breve insight.
- **[Categoría]** — X% negativo, Y menciones. Breve insight.

---

## 🎯 Matriz de Acciones Prioritarias

Usa niveles de urgencia con datos de respaldo:
- **🔴 URGENTE:** "Atender [Categoría] — solo [X%] sentimiento positivo con [Y] menciones negativas"
- **🟡 ALTO:** "Mejorar [Categoría] — [X%] tasa negativa, [Y] menciones señaladas"
- **🟢 MONITOREAR:** "Seguir [Categoría] — actualmente estable en [X%] positivo"

---

## ⚡ Registro de Riesgos

Cada riesgo debe citar métricas específicas:
- **Riesgo:** "Insatisfacción en [Categoría]" — Evidencia: [X%] negativo, [Y] menciones, [Z]/5 calificación
- **Riesgo:** "Preocupación en [Categoría]" — Evidencia: números específicos de los datos

---

## 📋 Recomendaciones de Panel de KPIs

Para CADA KPI recomendado:
- **KPI:** "[Nombre de la métrica]"
  - 📍 Valor base: [X%] *(del dataset actual)*
  - 🎯 Objetivo: [X+mejora%]
  - 📅 Plazo: período sugerido

REGLAS CRÍTICAS DE FORMATO:
- Usa ## para secciones principales y ### para subsecciones
- Incluye --- (líneas horizontales) entre CADA sección principal
- Usa **negritas** para todos los términos clave y nombres de categorías
- Usa viñetas (- ) para todas las listas
- Usa indicadores emoji para encabezados de sección como se muestra arriba
- Deja líneas en blanco entre secciones para respiro visual
- Este es un documento estratégico de nivel directivo — tono de reporte ejecutivo con datos precisos

## ⚠️ RECORDATORIO DE MÉTRICAS CLAVE — USA ESTOS NÚMEROS EXACTOS:
{resumen_kpis}

NO inventes números. Usa SOLO las métricas mostradas arriba."""

        # Start simulated progress in background thread
        if self.progress_callback:
            self._llm_progress_thread = threading.Thread(
                target=self._simulate_llm_progress,
                args=(50, 85, 30),  # Progress from 50% to 85% over ~30 seconds
                daemon=True,
            )
            self._llm_progress_thread.start()

        # Build a compact KPI reminder to place at the END of the prompt
        # (LLMs attend most to tokens near the end — recency bias)
        total = len(self.df)
        pct_pos = round((self.df['Sentimiento'] == 'Positivo').sum() / total * 100, 1)
        pct_neu = round((self.df['Sentimiento'] == 'Neutro').sum() / total * 100, 1)
        pct_neg = round((self.df['Sentimiento'] == 'Negativo').sum() / total * 100, 1)
        avg_rating = round(float(self.df['Calificacion'].mean()), 2) if 'Calificacion' in self.df.columns else 'N/A'
        kpi_reminder = (
            f'Total Reviews: {total} | '
            f'Positive: {pct_pos}% | Neutral: {pct_neu}% | Negative: {pct_neg}% | '
            f'Avg Rating: {avg_rating}/5'
        )
        logger.info(f'Phase 8 KPI reminder for LLM: {kpi_reminder}')

        try:
            result = self._invocar_llm_con_retry(
                template=template,
                input_data={
                    'metricas': metrics_context,
                    'resumen_estructurado': summary_context,
                    'resumen_kpis': kpi_reminder,
                },
                max_retries=3,
                descripcion='strategic insights',
            )
            return result.strip() if result else '[Could not generate strategic insights]'
        finally:
            # Stop simulated progress
            self._llm_in_progress = False
            if self._llm_progress_thread:
                self._llm_progress_thread.join(timeout=1)
            self._report_progress(90, 'Insights generados')

    # ── Orchestration ────────────────────────────────────────────────

    def _generar_insights(self) -> dict[str, Any]:
        """Orchestrate the insights generation pipeline."""
        print('\n   Compiling all metrics and statistics...')
        metrics_context = self._compile_all_metrics()

        print('   Preparing structured summary context...')
        summary_context = self._compile_structured_summary()

        print('\n   Initializing LLM...')
        self._inicializar_llm()

        print('   Generating comprehensive strategic insights report...')
        global_insights = self._generar_insight_global(metrics_context, summary_context)

        result = {
            'metadata': {
                'fecha_generacion': datetime.now().isoformat(),
                'total_reviews': len(self.df),
                'structured_summary_available': self.structured_summary is not None,
                'phase': '08_strategic_insights',
            },
            'insights': {
                'global': global_insights,
            },
        }

        return result

    def _guardar_resultado(self, resultado: dict):
        """Save the insights result to JSON."""
        self._report_progress(95, 'Guardando resultados...')

        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)

        with open(self.output_path, 'w', encoding='utf-8') as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)

        print(f'\n   ✓ Strategic insights saved to: {self.output_path}')
        self._report_progress(100, 'Fase completada')

    def ya_procesado(self):
        """Check if this phase has already been executed."""
        return self.output_path.exists()

    def procesar(self, forzar: bool = False):
        """
        Execute the strategic insights generation pipeline.

        Args:
            forzar: If True, re-run even if output already exists
        """
        if not forzar and self.ya_procesado():
            print('   ⏭️  Phase already executed (skipping)')
            return

        print('   Starting strategic insights generation...')

        # 1. Load all data
        self._cargar_datos()

        # 2. Generate insights
        resultado = self._generar_insights()

        # 3. Save result
        self._guardar_resultado(resultado)

        print('\n✅ Strategic insights generated successfully')
        print('   • Comprehensive report: generated')
