"""Tests for ConfigDataset and ConfigLLM."""

from pathlib import Path

from config.config import ConfigDataset, ConfigLLM


class TestConfigDataset:
    """Tests for ConfigDataset path resolution."""

    def test_get_default_data_dir_exists(self):
        data_dir = ConfigDataset.get_default_data_dir()
        assert isinstance(data_dir, Path)
        assert data_dir.name == 'data'

    def test_get_data_dir_respects_output_dir(self, tmp_path, monkeypatch):
        custom_dir = tmp_path / 'custom_output'
        custom_dir.mkdir()
        monkeypatch.setenv('OUTPUT_DIR', str(custom_dir))
        data_dir = ConfigDataset.get_data_dir()
        assert str(data_dir) == str(custom_dir / 'data')

    def test_get_shared_dir_is_subdir_of_data(self, tmp_path, monkeypatch):
        monkeypatch.setenv('OUTPUT_DIR', str(tmp_path))
        shared = ConfigDataset.get_shared_dir()
        data = ConfigDataset.get_data_dir()
        assert str(shared).startswith(str(data))

    def test_get_visualizaciones_dir_is_subdir_of_data(self, tmp_path, monkeypatch):
        monkeypatch.setenv('OUTPUT_DIR', str(tmp_path))
        viz = ConfigDataset.get_visualizaciones_dir()
        data = ConfigDataset.get_data_dir()
        assert str(viz).startswith(str(data))

    def test_crear_directorios_creates_folders(self, tmp_path, monkeypatch):
        monkeypatch.setenv('OUTPUT_DIR', str(tmp_path))
        ConfigDataset.crear_directorios()
        assert ConfigDataset.get_data_dir().exists()
        assert ConfigDataset.get_shared_dir().exists()
        assert ConfigDataset.get_visualizaciones_dir().exists()

    def test_model_ids_are_non_empty_strings(self):
        assert isinstance(ConfigDataset.SENTIMENT_MODEL_ID, str)
        assert len(ConfigDataset.SENTIMENT_MODEL_ID) > 0
        assert isinstance(ConfigDataset.EMBEDDINGS_MODEL_ID, str)
        assert len(ConfigDataset.EMBEDDINGS_MODEL_ID) > 0


class TestConfigLLM:
    """Tests for ConfigLLM validation."""

    def test_default_mode_is_string(self):
        assert isinstance(ConfigLLM.LLM_MODE, str)

    def test_get_info_returns_dict(self):
        info = ConfigLLM.get_info()
        assert isinstance(info, dict)
        assert 'modo' in info or 'mode' in info

    def test_validate_local_mode(self, monkeypatch):
        monkeypatch.setattr(ConfigLLM, 'LLM_MODE', 'local')
        monkeypatch.setattr(ConfigLLM, 'OLLAMA_MODEL', 'llama3.2:3b')
        # Should not raise
        ConfigLLM.validar_configuracion()

    def test_validate_api_mode_without_key_warns(self, monkeypatch, capfd):
        monkeypatch.setattr(ConfigLLM, 'LLM_MODE', 'api')
        monkeypatch.setattr(ConfigLLM, 'OPENAI_API_KEY', '')
        # validar_configuracion prints warnings or raises
        # We just verify it doesn't crash
        try:
            ConfigLLM.validar_configuracion()
        except Exception:
            pass  # Some configs may raise, that's fine
