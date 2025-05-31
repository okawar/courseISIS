import React from 'react';
import { Button, Snackbar, Alert } from '@mui/material';
import * as XLSX from 'xlsx';
import { log } from '../utils/Logger';

const FileUploader = ({ setData, data, analysis, setAnalysis }) => {
  const [error, setError] = React.useState(null);

  const addToTestHistory = (newData, fileName = '') => {
    try {
      const testEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        data: newData,
        analysis: {
          distribution: '',
          parameters: {},
          empiricalFrequencies: [],
          theoreticalFrequencies: { Poisson: [], Binomial: [], NegativeBinomial: [] },
          chiSquareValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0, criticalValue: 0 },
          pValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0 },
          degreesOfFreedom: 0,
          significanceLevel: 0.05,
          hypothesisAccepted: false,
          binLabels: [],
          meanCI: [],
          varianceCI: [],
        },
        source: fileName ? 'file_upload' : 'project_load',
        fileName: fileName,
        dataStats: {
          recordCount: newData.length,
          totalItems: newData.reduce((sum, row) => sum + row.total, 0),
          totalDefects: newData.reduce((sum, row) => sum + row.defects, 0),
          averageDefectRate: newData.length > 0 ? 
            newData.reduce((sum, row) => sum + (row.defects / row.total), 0) / newData.length : 0
        }
      };

      const existingHistory = JSON.parse(localStorage.getItem('testHistory') || '[]');
      const updatedHistory = [...existingHistory, testEntry];
      
      // Ограничиваем историю до 100 записей
      if (updatedHistory.length > 100) {
        updatedHistory.splice(0, updatedHistory.length - 100);
      }
      
      localStorage.setItem('testHistory', JSON.stringify(updatedHistory));
      
      log('info', 'Запись добавлена в историю тестов', {
        historyId: testEntry.id,
        source: testEntry.source,
        fileName: fileName,
        recordCount: testEntry.dataStats.recordCount,
        totalHistoryItems: updatedHistory.length
      });
      
      return testEntry.id;
    } catch (error) {
      log('error', 'Ошибка добавления в историю тестов', { error: error.message });
      return null;
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setError('Ошибка: файл не выбран');
      log('error', 'Файл не выбран');
      return;
    }

    log('info', '🔄 НАЧАЛО ЗАГРУЗКИ ФАЙЛА', { 
      fileName: file.name, 
      fileSize: file.size,
      fileType: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        log('info', 'Начинаем обработку содержимого файла', { 
          fileLength: event.target.result.length 
        });

        const fileType = file.name.split('.').pop().toLowerCase();
        let jsonData;

        log('debug', 'Определен тип файла', { fileType });

        if (fileType === 'csv') {
          // Обработка CSV
          log('debug', 'Обработка CSV файла');
          const text = event.target.result;
          const workbook = XLSX.read(text, { type: 'string' });
          const sheetName = workbook.SheetNames[0];
          jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            raw: false,
          });
          
          log('debug', 'CSV parsed, строк найдено', { rawRows: jsonData.length });
          
          // Преобразование массива строк в объекты
          jsonData = jsonData.slice(1).map((row, index) => {
            const result = {
              party_number: Number(row[0]),
              details_in_party: Number(row[1]),
              defects_in_party: Number(row[2]),
            };
            
            if (index < 5) { // Логируем первые 5 строк для отладки
              log('debug', `CSV строка ${index + 1} обработана`, result);
            }
            
            return result;
          });
        } else if (['xlsx', 'xls'].includes(fileType)) {
          // Обработка Excel
          log('debug', 'Обработка Excel файла');
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          log('debug', 'Excel workbook обработан', { 
            sheetNames: workbook.SheetNames,
            activeSheet: sheetName 
          });
          
          jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          log('debug', 'Excel данные извлечены', { 
            recordCount: jsonData.length,
            sampleRecord: jsonData[0] 
          });
        } else {
          throw new Error('Неподдерживаемый формат файла. Используйте .csv, .xlsx или .xls');
        }

        log('info', 'Файл успешно прочитан, начинаем валидацию', { 
          rawRecordCount: jsonData.length 
        });

        // Валидация и преобразование данных
        const formattedData = jsonData.map((row, index) => {
          const total = Number(row.details_in_party);
          const defects = Number(row.defects_in_party);
          
          if (isNaN(total) || isNaN(defects)) {
            const error = `Некорректные данные в строке ${index + 2}: total=${total}, defects=${defects}`;
            log('error', 'Валидация не пройдена - некорректные числа', { 
              rowIndex: index + 2, 
              total, 
              defects,
              originalRow: row
            });
            throw new Error(error);
          }
          
          if (total < 0 || defects < 0 || defects > total) {
            const error = `Некорректные данные в строке ${index + 2}: total=${total}, defects=${defects} (отрицательные значения или defects > total)`;
            log('error', 'Валидация не пройдена - логические ошибки', { 
              rowIndex: index + 2, 
              total, 
              defects,
              issues: {
                negativetTotal: total < 0,
                negativeDefects: defects < 0,
                defectsExceedTotal: defects > total
              }
            });
            throw new Error(error);
          }
          
          return { total, defects };
        });

        if (formattedData.length === 0) {
          log('error', 'Файл пуст после обработки');
          throw new Error('Файл пуст');
        }

        // Статистика по загруженным данным
        const dataStats = {
          recordCount: formattedData.length,
          totalItems: formattedData.reduce((sum, row) => sum + row.total, 0),
          totalDefects: formattedData.reduce((sum, row) => sum + row.defects, 0),
          minDefects: Math.min(...formattedData.map(row => row.defects)),
          maxDefects: Math.max(...formattedData.map(row => row.defects)),
          minTotal: Math.min(...formattedData.map(row => row.total)),
          maxTotal: Math.max(...formattedData.map(row => row.total)),
        };
        
        dataStats.averageDefectRate = dataStats.totalItems > 0 ? 
          dataStats.totalDefects / dataStats.totalItems : 0;

        log('info', '✅ ФАЙЛ УСПЕШНО ЗАГРУЖЕН И ВАЛИДИРОВАН', {
          fileName: file.name,
          fileType,
          ...dataStats
        });

        // ИСПРАВЛЕНИЕ: Сначала устанавливаем данные в состояние
        setData(formattedData);
        setError(null);
        
        // Сбрасываем анализ при загрузке новых данных
        const newAnalysis = {
          distribution: '',
          parameters: {},
          empiricalFrequencies: [],
          theoreticalFrequencies: { Poisson: [], Binomial: [], NegativeBinomial: [] },
          chiSquareValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0, criticalValue: 0 },
          pValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0 },
          degreesOfFreedom: 0,
          significanceLevel: 0.05,
          hypothesisAccepted: false,
          binLabels: [],
          meanCI: [],
          varianceCI: [],
        };
        
        setAnalysis(newAnalysis);

        // УДАЛЕНО: сохранение в историю - теперь это происходит после завершения анализа
        log('info', 'Данные установлены, анализ будет выполнен автоматически');

      } catch (error) {
        log('error', '❌ ОШИБКА ЗАГРУЗКИ ФАЙЛА', { 
          fileName: file.name,
          error: error.message,
          stack: error.stack 
        });
        setError(error.message);
      }
    };

    reader.onerror = (error) => {
      log('error', 'Ошибка чтения файла', { 
        fileName: file.name,
        error: error.message 
      });
      setError('Ошибка чтения файла');
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSaveProject = () => {
    try {
      log('info', 'Начинаем сохранение проекта', { 
        dataLength: data.length,
        hasAnalysis: !!analysis.distribution 
      });

      const project = { 
        data, 
        analysis,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      localStorage.setItem('defectAnalyzerProject', JSON.stringify(project));
      
      log('info', '✅ ПРОЕКТ СОХРАНЁН', { 
        dataLength: data.length,
        analysisDistribution: analysis.distribution,
        timestamp: project.timestamp
      });
      
      setError(null);
      alert('Проект сохранён!');
    } catch (error) {
      log('error', '❌ ОШИБКА СОХРАНЕНИЯ ПРОЕКТА', { 
        error: error.message,
        dataLength: data.length 
      });
      setError('Ошибка при сохранении проекта');
    }
  };

  const handleLoadProject = () => {
    try {
      log('info', 'Начинаем загрузку проекта');

      const project = localStorage.getItem('defectAnalyzerProject');
      if (!project) {
        log('error', 'Сохранённый проект не найден в localStorage');
        setError('Сохранённый проект не найден');
        return;
      }

      const { data: loadedData, analysis: loadedAnalysis, timestamp, version } = JSON.parse(project);
      
      log('info', 'Проект найден в localStorage', {
        dataLength: loadedData?.length || 0,
        analysisDistribution: loadedAnalysis?.distribution || 'none',
        savedTimestamp: timestamp,
        projectVersion: version
      });

      setData(loadedData);
      setAnalysis(loadedAnalysis);
      
      // Добавляем запись в историю о восстановлении проекта (без имени файла)
      if (loadedData && loadedData.length > 0) {
        const historyId = addToTestHistory(loadedData, '');
        log('info', 'Проект добавлен в историю при загрузке', { historyId });
      }

      log('info', '✅ ПРОЕКТ ЗАГРУЖЕН', { 
        dataLength: loadedData?.length || 0,
        analysisDistribution: loadedAnalysis?.distribution || 'none'
      });
      
      setError(null);
      alert('Проект загружен!');
    } catch (error) {
      log('error', '❌ ОШИБКА ЗАГРУЗКИ ПРОЕКТА', { 
        error: error.message,
        stack: error.stack 
      });
      setError('Ошибка при загрузке проекта');
    }
  };

  const handleCloseSnackbar = () => {
    log('debug', 'Закрытие уведомления об ошибке', { error });
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
