import React from 'react';
import { Button, Snackbar, Alert } from '@mui/material';
import * as XLSX from 'xlsx';

const FileUploader = ({ setData, data, analysis, setAnalysis }) => {
  const [error, setError] = React.useState(null);

  const log = (level, message, data = {}) => {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    const logLevels = { error: true, info: true, debug: false };
    if (logLevels[level]) {
      console.log(`[DefectAnalyzer - ${timestamp}] ${level.toUpperCase()}: ${message}`, { ...data, timestamp });
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setError('Ошибка: файл не выбран');
      log('error', 'Файл не выбран');
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const fileType = file.name.split('.').pop().toLowerCase();
        let jsonData;

        if (fileType === 'csv') {
          // Обработка CSV
          const text = event.target.result;
          jsonData = XLSX.utils.sheet_to_json(XLSX.read(text, { type: 'string' }).Sheets.Sheet1, {
            header: 1,
            raw: false,
          });
          // Преобразование массива строк в объекты
          jsonData = jsonData.slice(1).map((row) => ({
            party_number: Number(row[0]),
            details_in_party: Number(row[1]),
            defects_in_party: Number(row[2]),
          }));
        } else if (['xlsx', 'xls'].includes(fileType)) {
          // Обработка Excel
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          jsonData = XLSX.utils.sheet_to_json(worksheet);
        } else {
          throw new Error('Неподдерживаемый формат файла. Используйте .csv, .xlsx или .xls');
        }

        // Валидация и преобразование данных
        const formattedData = jsonData.map((row, index) => {
          const total = Number(row.details_in_party);
          const defects = Number(row.defects_in_party);
          if (isNaN(total) || isNaN(defects)) {
            throw new Error(`Некорректные данные в строке ${index + 2}: total=${total}, defects=${defects}`);
          }
          if (total < 0 || defects < 0 || defects > total) {
            throw new Error(
              `Некорректные данные в строке ${index + 2}: total=${total}, defects=${defects} (отрицательные значения или defects > total)`
            );
          }
          return { total, defects };
        });

        if (formattedData.length === 0) {
          throw new Error('Файл пуст');
        }

        log('info', 'Файл успешно загружен', {
          fileName: file.name,
          records: formattedData.length,
        });
        setData(formattedData);
        setError(null);
      } catch (error) {
        log('error', 'Ошибка загрузки файла', { error: error.message });
        setError(error.message);
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSaveProject = () => {
    try {
      const project = { data, analysis };
      localStorage.setItem('defectAnalyzerProject', JSON.stringify(project));
      log('info', 'Проект сохранён', { dataLength: data.length });
      setError(null);
      alert('Проект сохранён!');
    } catch (error) {
      log('error', 'Ошибка сохранения проекта', { error: error.message });
      setError('Ошибка при сохранении проекта');
    }
  };

  const handleLoadProject = () => {
    try {
      const project = localStorage.getItem('defectAnalyzerProject');
      if (!project) {
        log('error', 'Сохранённый проект не найден');
        setError('Сохранённый проект не найден');
        return;
      }
      const { data: loadedData, analysis: loadedAnalysis } = JSON.parse(project);
      setData(loadedData);
      setAnalysis(loadedAnalysis);
      log('info', 'Проект загружен', { dataLength: loadedData.length });
      setError(null);
      alert('Проект загружен!');
    } catch (error) {
      log('error', 'Ошибка загрузки проекта', { error: error.message });
      setError('Ошибка при загрузке проекта');
    }
  };

  const handleCloseSnackbar = () => {
    log('info', 'Закрытие уведомления', { error });
    setError(null);
  };

  return (
    <div className="flex gap-4 flex-col">
      <Button
        variant="contained"
        component="label"
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg"
      >
        Загрузить файл
        <input type="file" hidden onChange={handleFile} accept=".xlsx,.xls,.csv" />
      </Button>
      <Button
        variant="contained"
        onClick={handleSaveProject}
        className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg"
      >
        Сохранить проект
      </Button>
      <Button
        variant="contained"
        onClick={handleLoadProject}
        className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg"
      >
        Загрузить проект
      </Button>
      <Snackbar open={!!error} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default FileUploader;
