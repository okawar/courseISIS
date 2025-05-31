import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Card, 
  CardContent, 
  TextField, 
  Table, 
  TableHead, 
  TableRow, 
  TableCell, 
  TableBody, 
  TableContainer,
  Paper,
  Snackbar, 
  Alert, 
  MenuItem, 
  Typography,
  Box,
  Collapse
} from '@mui/material';
import { Restore } from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { jStat } from 'jstat';

const ResultSummary = ({ analysis, data, setAnalysis, setData, significanceLevel }) => {
  const distributions = ['Poisson', 'Binomial', 'NegativeBinomial'];
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const calculateCriticalValue = (df, significanceLevel) => {
    return isFinite(df) && df > 0 ? jStat.chisquare.inv(1 - significanceLevel, df) : 'N/A';
  };

  const calculateCriticalValues = (significanceLevel) => {
    const criticalValues = {};
    const df = analysis.degreesOfFreedom;
    
    distributions.forEach((dist) => {
      criticalValues[dist] = calculateCriticalValue(df, significanceLevel);
    });
    
    return criticalValues;
  };

  const isHypothesisAccepted = (dist, criticalValue) => {
    return (
      isFinite(analysis.chiSquareValues[dist]) &&
      isFinite(criticalValue) &&
      isFinite(analysis.pValues[dist]) &&
      analysis.chiSquareValues[dist] < criticalValue &&
      analysis.pValues[dist] >= analysis.significanceLevel
    );
  };

  const getDistributionName = (dist) => {
    const names = {
      'Poisson': 'Пуассон',
      'Binomial': 'Биномиальное', 
      'NegativeBinomial': 'Отрицательное биномиальное'
    };
    return names[dist] || 'Не определено';
  };

  const handleDistributionChange = (e) => {
    setAnalysis((prev) => ({ ...prev, distribution: e.target.value }));
  };

  const handleSignificanceChange = (e) => {
    const value = parseFloat(e.target.value);
    if (value >= 0.001 && value <= 0.20) {
      const newCriticalValues = calculateCriticalValues(value);
      const newHypothesisAccepted = {};
      
      distributions.forEach((dist) => {
        newHypothesisAccepted[dist] = isHypothesisAccepted(dist, newCriticalValues[dist]);
      });

      setAnalysis((prev) => ({
        ...prev,
        significanceLevel: value,
        criticalValues: newCriticalValues,
        hypothesisAccepted: Object.values(newHypothesisAccepted).some(Boolean),
      }));
    } else {
      setSnackbarMessage('Уровень значимости должен быть в диапазоне [0.001, 0.20].');
      setOpenSnackbar(true);
    }
  };

  useEffect(() => {
    if (analysis.significanceLevel && isFinite(analysis.degreesOfFreedom)) {
      const newCriticalValues = calculateCriticalValues(analysis.significanceLevel);
      
      setAnalysis((prev) => ({
        ...prev,
        criticalValues: newCriticalValues,
      }));
    }

    const hasLowFrequencies = Object.values(analysis.theoreticalFrequencies || {}).some((freqs) =>
      Array.isArray(freqs) && freqs.some((f) => f < 5)
    );
    
    if (hasLowFrequencies) {
      setSnackbarMessage('Предупреждение: некоторые ожидаемые частоты < 5, тест хи-квадрат может быть ненадёжным.');
      setOpenSnackbar(true);
    }
  }, [analysis.degreesOfFreedom, analysis.significanceLevel, analysis.theoreticalFrequencies, setAnalysis]);

  const handleExportCSV = () => {
    const csvData = [
      ['=== ОТЧЕТ ПО АНАЛИЗУ ДЕФЕКТНОСТИ ПРОДУКЦИИ ==='],
      ['Дата анализа', new Date().toLocaleString('ru-RU')],
      ['Количество партий', data.length],
      [],
      ['=== ОСНОВНЫЕ СТАТИСТИКИ ==='],
      ['Общее количество деталей', data.reduce((sum, row) => sum + row.total, 0)],
      ['Общее количество дефектов', data.reduce((sum, row) => sum + row.defects, 0)],
      ['Среднее количество дефектов на партию', data.length > 0 ? (data.reduce((sum, row) => sum + row.defects, 0) / data.length).toFixed(3) : 'N/A'],
      ['Общий процент брака (%)', data.reduce((sum, row) => sum + row.total, 0) > 0 ? ((data.reduce((sum, row) => sum + row.defects, 0) / data.reduce((sum, row) => sum + row.total, 0)) * 100).toFixed(2) : 'N/A'],
      [],
      ['=== РЕЗУЛЬТАТЫ АНАЛИЗА РАСПРЕДЕЛЕНИЙ ==='],
      ['Лучшее распределение', getDistributionName(analysis.distribution) || 'Не определено'],
      ['Статус гипотезы', analysis.hypothesisAccepted ? 'Принимается' : 'Отвергается'],
      ['Уровень значимости', analysis.significanceLevel || 'N/A'],
      ['Степени свободы', analysis.degreesOfFreedom || 'N/A'],
      [],
      ['=== ПАРАМЕТРЫ ЛУЧШЕГО РАСПРЕДЕЛЕНИЯ ==='],
      ...(analysis.distribution === 'Poisson' ? [
        ['Параметр λ (лямбда)', analysis.parameters?.lambda?.toFixed(4) || 'N/A'],
        ['Интерпретация', 'Среднее количество дефектов на партию']
      ] : analysis.distribution === 'Binomial' ? [
        ['Параметр n (размер выборки)', analysis.parameters?.n || 'N/A'],
        ['Параметр p (вероятность)', analysis.parameters?.p?.toFixed(6) || 'N/A'],
        ['Интерпретация', 'Фиксированный размер партий с постоянной вероятностью дефекта']
      ] : analysis.distribution === 'NegativeBinomial' ? [
        ['Параметр r', analysis.parameters?.r?.toFixed(4) || 'N/A'],
        ['Параметр p', analysis.parameters?.p?.toFixed(6) || 'N/A'],
        ['Интерпретация', 'Данные с избыточной дисперсией (сверхдисперсия)']
      ] : [['Параметры', 'Не определены']]),
      [],
      ['=== СТАТИСТИКИ ХИ-КВАДРАТ ==='],
      ['Распределение', 'χ²', 'Критическое значение', 'p-значение', 'Статус гипотезы'],
      ...distributions.map((dist) => [
        getDistributionName(dist),
        isFinite(analysis.chiSquareValues?.[dist]) ? analysis.chiSquareValues[dist].toFixed(3) : 'N/A',
        isFinite(analysis.criticalValues?.[dist]) ? analysis.criticalValues[dist].toFixed(3) : 'N/A',
        isFinite(analysis.pValues?.[dist]) ? analysis.pValues[dist].toFixed(6) : 'N/A',
        isHypothesisAccepted(dist, analysis.criticalValues?.[dist]) ? 'Принимается' : 'Отвергается'
      ]),
      [],
      ['=== ДОВЕРИТЕЛЬНЫЕ ИНТЕРВАЛЫ (95%) ==='],
      ['Среднее значение', analysis.meanCI ? `[${analysis.meanCI[0]?.toFixed(4)}, ${analysis.meanCI[1]?.toFixed(4)}]` : 'N/A'],
      ['Дисперсия', analysis.varianceCI ? `[${analysis.varianceCI[0]?.toFixed(4)}, ${analysis.varianceCI[1]?.toFixed(4)}]` : 'N/A'],
      [],
      ['=== РЕКОМЕНДАЦИИ ==='],
      [analysis.hypothesisAccepted 
        ? `Данные соответствуют ${getDistributionName(analysis.distribution)} распределению. Можно использовать для прогнозирования.`
        : 'Данные не соответствуют стандартным распределениям. Рекомендуется дополнительный анализ.'],
      [analysis.theoreticalFrequencies && Object.values(analysis.theoreticalFrequencies).some(freqs => 
        Array.isArray(freqs) && freqs.some(f => f < 5)) 
        ? 'Предупреждение: некоторые ожидаемые частоты < 5, результаты могут быть неточными.'
        : 'Все ожидаемые частоты достаточны для надежного анализа.']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(csvData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Отчет анализа');
    XLSX.writeFile(wb, `отчет_анализа_дефектности_${new Date().toISOString().split('T')[0]}.csv`);
    
    setSnackbarMessage('Отчет экспортирован в CSV!');
    setOpenSnackbar(true);
  };

  const handleExportXLSX = () => {
    const analysisData = [
      ['ОТЧЕТ ПО АНАЛИЗУ ДЕФЕКТНОСТИ ПРОДУКЦИИ'],
      ['Дата анализа', new Date().toLocaleString('ru-RU')],
      ['Количество партий', data.length],
      [],
      ['ОСНОВНЫЕ СТАТИСТИКИ'],
      ['Показатель', 'Значение'],
      ['Общее количество деталей', data.reduce((sum, row) => sum + row.total, 0)],
      ['Общее количество дефектов', data.reduce((sum, row) => sum + row.defects, 0)],
      ['Среднее количество дефектов на партию', data.length > 0 ? (data.reduce((sum, row) => sum + row.defects, 0) / data.length).toFixed(3) : 'N/A'],
      ['Общий процент брака (%)', data.reduce((sum, row) => sum + row.total, 0) > 0 ? ((data.reduce((sum, row) => sum + row.defects, 0) / data.reduce((sum, row) => sum + row.total, 0)) * 100).toFixed(2) : 'N/A'],
      [],
      ['РЕЗУЛЬТАТЫ АНАЛИЗА РАСПРЕДЕЛЕНИЙ'],
      ['Характеристика', 'Значение'],
      ['Лучшее распределение', getDistributionName(analysis.distribution) || 'Не определено'],
      ['Статус гипотезы', analysis.hypothesisAccepted ? 'Принимается' : 'Отвергается'],
      ['Уровень значимости', analysis.significanceLevel || 'N/A'],
      ['Степени свободы', analysis.degreesOfFreedom || 'N/A'],
      [],
      ['ПАРАМЕТРЫ РАСПРЕДЕЛЕНИЯ'],
      ['Параметр', 'Значение'],
      ...(analysis.distribution === 'Poisson' ? [
        ['λ (лямбда)', analysis.parameters?.lambda?.toFixed(4) || 'N/A'],
        ['Интерпретация', 'Среднее количество дефектов на партию']
      ] : analysis.distribution === 'Binomial' ? [
        ['n (размер выборки)', analysis.parameters?.n || 'N/A'],
        ['p (вероятность дефекта)', analysis.parameters?.p?.toFixed(6) || 'N/A'],
        ['Интерпретация', 'Фиксированный размер партий с постоянной вероятностью дефекта']
      ] : analysis.distribution === 'NegativeBinomial' ? [
        ['r (параметр формы)', analysis.parameters?.r?.toFixed(4) || 'N/A'],
        ['p (вероятность успеха)', analysis.parameters?.p?.toFixed(6) || 'N/A'],
        ['Интерпретация', 'Данные с избыточной дисперсией (сверхдисперсия)']
      ] : [['Параметры', 'Не определены']]),
      [],
      ['ДОВЕРИТЕЛЬНЫЕ ИНТЕРВАЛЫ (95%)'],
      ['Показатель', 'Нижняя граница', 'Верхняя граница'],
      ['Среднее значение', 
       analysis.meanCI ? analysis.meanCI[0]?.toFixed(4) : 'N/A',
       analysis.meanCI ? analysis.meanCI[1]?.toFixed(4) : 'N/A'],
      ['Дисперсия',
       analysis.varianceCI ? analysis.varianceCI[0]?.toFixed(4) : 'N/A',
       analysis.varianceCI ? analysis.varianceCI[1]?.toFixed(4) : 'N/A']
    ];

    const chiSquareData = [
      ['СТАТИСТИКИ ХИ-КВАДРАТ'],
      [],
      ['Распределение', 'χ²', 'Критическое значение', 'p-значение', 'Статус гипотезы', 'Заключение'],
      ...distributions.map((dist) => {
        const isAccepted = isHypothesisAccepted(dist, analysis.criticalValues?.[dist]);
        return [
          getDistributionName(dist),
          isFinite(analysis.chiSquareValues?.[dist]) ? analysis.chiSquareValues[dist].toFixed(3) : 'N/A',
          isFinite(analysis.criticalValues?.[dist]) ? analysis.criticalValues[dist].toFixed(3) : 'N/A',
          isFinite(analysis.pValues?.[dist]) ? analysis.pValues[dist].toFixed(6) : 'N/A',
          isAccepted ? 'Принимается' : 'Отвергается',
          isAccepted ? 'Данные соответствуют распределению' : 'Данные не соответствуют распределению'
        ];
      }),
      [],
      ['ИНТЕРПРЕТАЦИЯ РЕЗУЛЬТАТОВ'],
      ['Критерий', 'Описание'],
      ['χ² < Критическое значение', 'Гипотеза принимается'],
      ['p-значение ≥ α', 'Гипотеза принимается'],
      ['α (уровень значимости)', analysis.significanceLevel || 'N/A'],
      ['Степени свободы', analysis.degreesOfFreedom || 'N/A']
    ];

    const recommendationsData = [
      ['РЕКОМЕНДАЦИИ И ВЫВОДЫ'],
      [],
      ['ОСНОВНОЙ ВЫВОД'],
      [analysis.hypothesisAccepted 
        ? `Данные соответствуют ${getDistributionName(analysis.distribution)} распределению с уровнем значимости ${analysis.significanceLevel}.`
        : 'Ни одно из тестируемых распределений не подходит для описания данных.'],
      [],
      ['ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ'],
      ...(analysis.hypothesisAccepted ? [
        ['✓ Можно использовать выбранное распределение для прогнозирования'],
        ['✓ Параметры распределения подходят для статистического контроля качества'],
        ['✓ Результаты можно использовать для планирования производства']
      ] : [
        ['⚠ Требуется дополнительный анализ данных'],
        ['⚠ Рассмотрите возможность использования других распределений'],
        ['⚠ Проверьте наличие выбросов или систематических ошибок']
      ]),
      [],
      ['ПРЕДУПРЕЖДЕНИЯ'],
      ...(analysis.theoreticalFrequencies && Object.values(analysis.theoreticalFrequencies).some(freqs => 
        Array.isArray(freqs) && freqs.some(f => f < 5)) ? [
        ['⚠ Некоторые ожидаемые частоты меньше 5'],
        ['⚠ Результаты хи-квадрат теста могут быть неточными'],
        ['⚠ Рекомендуется увеличить размер выборки']
      ] : [
        ['✓ Все ожидаемые частоты достаточны для надежного анализа'],
        ['✓ Результаты хи-квадрат теста надежны']
      ]),
      [],
      ['ДАТА СОЗДАНИЯ ОТЧЕТА'],
      [new Date().toLocaleString('ru-RU')]
    ];

    const wb = XLSX.utils.book_new();
    
    const analysisSheet = XLSX.utils.aoa_to_sheet(analysisData);
    const chiSquareSheet = XLSX.utils.aoa_to_sheet(chiSquareData);
    const recommendationsSheet = XLSX.utils.aoa_to_sheet(recommendationsData);
    
    XLSX.utils.book_append_sheet(wb, analysisSheet, 'Основные результаты');
    XLSX.utils.book_append_sheet(wb, chiSquareSheet, 'Статистики хи-квадрат');
    XLSX.utils.book_append_sheet(wb, recommendationsSheet, 'Рекомендации');
    
    XLSX.writeFile(wb, `отчет_анализа_дефектности_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    setSnackbarMessage('Полный отчет экспортирован в XLSX!');
    setOpenSnackbar(true);
  };

  const handleToggleHistory = () => {
    setShowHistory((prev) => !prev);
  };

  const handleRestoreTest = (test) => {
    try {
      if (test.data && Array.isArray(test.data)) {
        setData(test.data);
      }
      if (test.analysis && typeof test.analysis === 'object') {
        setAnalysis(test.analysis);
      }
      setSnackbarMessage('Тест успешно восстановлен!');
      setOpenSnackbar(true);
      setShowHistory(false);
    } catch (error) {
      console.error('Ошибка при восстановлении теста:', error);
      setSnackbarMessage('Ошибка при восстановлении теста.');
      setOpenSnackbar(true);
    }
  };

  const getValidTestHistory = () => {
    try {
      const rawHistory = localStorage.getItem('testHistory');
      if (!rawHistory) return [];
      
      const history = JSON.parse(rawHistory);
      if (!Array.isArray(history)) return [];
      
      const validHistory = history.filter(test => {
        return (
          test && 
          typeof test === 'object' &&
          test.timestamp &&
          test.data && 
          Array.isArray(test.data) &&
          test.data.length > 0 &&
          test.analysis &&
          typeof test.analysis === 'object'
        );
      });

      if (validHistory.length !== history.length) {
        localStorage.setItem('testHistory', JSON.stringify(validHistory));
      }

      return validHistory;
    } catch (error) {
      console.error('Ошибка при загрузке истории тестов:', error);
      localStorage.removeItem('testHistory');
      return [];
    }
  };

  const testHistory = getValidTestHistory();

  const getBestDistribution = (testAnalysis) => {
    if (!testAnalysis || !testAnalysis.chiSquareValues || !testAnalysis.pValues) {
      return null;
    }

    let bestDist = null;
    let bestPValue = -1;
    let bestChiSquare = Infinity;

    distributions.forEach(dist => {
      const chiSquare = testAnalysis.chiSquareValues[dist];
      const pValue = testAnalysis.pValues[dist];
      
      if (isFinite(chiSquare) && isFinite(pValue)) {
        if (pValue > bestPValue || (pValue === bestPValue && chiSquare < bestChiSquare)) {
          bestPValue = pValue;
          bestChiSquare = chiSquare;
          bestDist = dist;
        }
      }
    });

    return bestDist;
  };

  // ИСПРАВЛЕНА функция для определения статуса гипотезы для конкретного теста и распределения
  const getTestHypothesisStatusForDistribution = (testAnalysis, distribution) => {
    if (!testAnalysis || !testAnalysis.chiSquareValues || !testAnalysis.pValues) {
      return false;
    }
    
    const chiSquare = testAnalysis.chiSquareValues[distribution];
    const pValue = testAnalysis.pValues[distribution];
    const significanceLevel = testAnalysis.significanceLevel || 0.05;
    const df = testAnalysis.degreesOfFreedom;
    
    if (!isFinite(chiSquare) || !isFinite(pValue) || !isFinite(df) || df <= 0) {
      return false;
    }
    
    try {
      const criticalValue = jStat.chisquare.inv(1 - significanceLevel, df);
      
      return (
        isFinite(criticalValue) &&
        chiSquare < criticalValue && 
        pValue >= significanceLevel
      );
    } catch (error) {
      console.error('Ошибка при расчете критического значения:', error);
      return false;
    }
  };

  // ИСПРАВЛЕНА функция для определения общего статуса теста (есть ли хотя бы одно принятое распределение)
  const getOverallTestStatus = (testAnalysis) => {
    if (!testAnalysis) return false;
    
    // Проверяем каждое распределение
    const statusResults = distributions.map(dist => {
      const status = getTestHypothesisStatusForDistribution(testAnalysis, dist);
      console.log(`Статус для ${dist}:`, status, {
        chi2: testAnalysis.chiSquareValues?.[dist],
        pValue: testAnalysis.pValues?.[dist],
        significanceLevel: testAnalysis.significanceLevel,
        df: testAnalysis.degreesOfFreedom
      });
      return status;
    });
    
    const hasAcceptedHypothesis = statusResults.some(status => status === true);
    console.log('Общий статус теста:', hasAcceptedHypothesis, 'Результаты по распределениям:', statusResults);
    
    return hasAcceptedHypothesis;
  };

  const getCriticalValue = (dist) => {
    if (analysis.criticalValues && analysis.criticalValues[dist]) {
      return analysis.criticalValues[dist];
    }
    return calculateCriticalValue(analysis.degreesOfFreedom, analysis.significanceLevel);
  };

  return (
    <Card className="rounded-lg shadow-md bg-white">
      <CardContent className="p-4">
        <Typography variant="h6" className="text-gray-800 font-semibold mb-4">
          Сводка результатов анализа
        </Typography>
        
        <Typography variant="subtitle1" className="text-gray-700 mb-2">
          <strong>Лучшее распределение:</strong> {getDistributionName(analysis.distribution) || 'Не определено'}
        </Typography>
        
        <Typography variant="subtitle1" className="text-gray-700 mb-2">
          <strong>Общий статус гипотезы:</strong> 
          <span className={analysis.hypothesisAccepted ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
            {analysis.hypothesisAccepted ? 'Принимается' : 'Отвергается'}
          </span>
        </Typography>

        {analysis.parameters && (
          <Typography variant="subtitle1" className="text-gray-700 mb-2">
            <strong>Параметры лучшего распределения:</strong> {
              analysis.distribution === 'Binomial'
                ? `p = ${analysis.parameters.p?.toFixed(4) || 'N/A'}, n = ${analysis.parameters.n || 'N/A'}`
                : analysis.distribution === 'Poisson'
                ? `λ = ${analysis.parameters.lambda?.toFixed(3) || 'N/A'}`
                : analysis.distribution === 'NegativeBinomial'
                ? `r = ${analysis.parameters.r?.toFixed(3) || 'N/A'}, p = ${analysis.parameters.p?.toFixed(4) || 'N/A'}`
                : 'N/A'
            }
          </Typography>
        )}
        
        <Typography variant="body1" className="text-gray-700 mb-2">
          <strong>Доверительный интервал для среднего (95%):</strong> 
          {analysis.meanCI ? ` [${analysis.meanCI[0]?.toFixed(3)}, ${analysis.meanCI[1]?.toFixed(3)}]` : ' N/A'}
        </Typography>
        
        <Typography variant="body1" className="text-gray-700 mb-4">
          <strong>Доверительный интервал для дисперсии (95%):</strong> 
          {analysis.varianceCI ? ` [${analysis.varianceCI[0]?.toFixed(3)}, ${analysis.varianceCI[1]?.toFixed(3)}]` : ' N/A'}
        </Typography>

        <Typography variant="h6" className="text-gray-800 font-semibold mb-2">
          Детальные результаты по распределениям
        </Typography>
        
        <div className="overflow-x-auto mb-4">
          <Table size="small" className="min-w-full border border-gray-300">
            <TableHead>
              <TableRow className="bg-gray-100">
                <TableCell className="font-semibold text-gray-700 border border-gray-300 px-4 py-2">
                  Распределение
                </TableCell>
                <TableCell className="font-semibold text-gray-700 border border-gray-300 px-4 py-2">
                  χ²
                </TableCell>
                <TableCell className="font-semibold text-gray-700 border border-gray-300 px-4 py-2">
                  Критическое значение
                </TableCell>
                <TableCell className="font-semibold text-gray-700 border border-gray-300 px-4 py-2">
                  p-значение
                </TableCell>
                <TableCell className="font-semibold text-gray-700 border border-gray-300 px-4 py-2">
                  Статус гипотезы
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {distributions.map((dist) => {
                const criticalValue = getCriticalValue(dist);
                const chiSquareValue = analysis.chiSquareValues?.[dist];
                const pValue = analysis.pValues?.[dist];
                const hypothesisStatus = isHypothesisAccepted(dist, criticalValue);
                
                return (
                  <TableRow key={dist} className={`hover:bg-gray-50 ${analysis.distribution === dist ? 'bg-blue-50' : ''}`}>
                    <TableCell className="text-gray-700 border border-gray-300 px-4 py-2">
                      <strong>{getDistributionName(dist)}</strong>
                      {analysis.distribution === dist && <span className="text-blue-600 ml-1">(выбрано)</span>}
                    </TableCell>
                    <TableCell className="text-gray-700 border border-gray-300 px-4 py-2">
                      {isFinite(chiSquareValue) ? chiSquareValue.toFixed(2) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-gray-700 border border-gray-300 px-4 py-2">
                      {isFinite(criticalValue) ? criticalValue.toFixed(2) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-gray-700 border border-gray-300 px-4 py-2">
                      {isFinite(pValue) ? pValue.toFixed(4) : 'N/A'}
                    </TableCell>
                    <TableCell className={`border border-gray-300 px-4 py-2 font-semibold ${hypothesisStatus ? 'text-green-600' : 'text-red-600'}`}>
                      {isFinite(chiSquareValue) && isFinite(criticalValue) && isFinite(pValue)
                        ? (hypothesisStatus ? 'Принимается' : 'Отвергается')
                        : 'N/A'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <TextField
            select
            label="Выбрать распределение"
            value={analysis.distribution || ''}
            onChange={handleDistributionChange}
            size="small"
            fullWidth
          >
            {distributions.map((dist) => (
              <MenuItem key={dist} value={dist}>
                {getDistributionName(dist)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            type="number"
            label="Уровень значимости"
            value={analysis.significanceLevel || ''}
            onChange={handleSignificanceChange}
            size="small"
            fullWidth
            inputProps={{ step: 0.001, min: 0.001, max: 0.20 }}
            helperText="Диапазон: 0.001 - 0.20"
          />
        </div>

        {testHistory.length > 0 && (
          <>
            <Button
              variant="outlined"
              onClick={handleToggleHistory}
              className="w-full mb-4"
              color="primary"
            >
              {showHistory ? 'Скрыть историю тестов' : `Показать историю тестов (${testHistory.length})`}
            </Button>

            <Collapse in={showHistory}>
              <Box mt={2}>
                {testHistory.length === 0 ? (
                  <Typography color="textSecondary" className="text-center p-4">
                    История тестов пуста
                  </Typography>
                ) : (
                  <TableContainer component={Paper} className="max-h-96 overflow-auto">
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow className="bg-gray-50">
                          <TableCell className="font-bold border border-gray-300">Время</TableCell>
                          <TableCell className="font-bold border border-gray-300">Распределение</TableCell>
                          <TableCell className="font-bold border border-gray-300">Статус</TableCell>
                          <TableCell className="font-bold border border-gray-300">Данные</TableCell>
                          <TableCell className="font-bold border border-gray-300">Действие</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {testHistory.slice(-10).reverse().map((test, i) => {
                          const bestDist = getBestDistribution(test.analysis);
                          const overallStatus = getOverallTestStatus(test.analysis);
                          const dataInfo = test.data ? `${test.data.length} партий` : 'Нет данных';
                          
                          return (
                            <TableRow key={i} className="hover:bg-gray-50">
                              <TableCell className="text-gray-700 border border-gray-300 px-4 py-2">
                                {test.timestamp ? new Date(test.timestamp).toLocaleString('ru-RU') : 'Неизвестно'}
                              </TableCell>
                              <TableCell className="text-gray-700 border border-gray-300 px-4 py-2">
                                {bestDist ? getDistributionName(bestDist) : 'Не определено'}
                              </TableCell>
                              <TableCell className={`border border-gray-300 px-4 py-2 font-semibold ${overallStatus ? 'text-green-600' : 'text-red-600'}`}>
                                {overallStatus ? 'Принята' : 'Отвергнута'}
                              </TableCell>
                              <TableCell className="text-gray-700 border border-gray-300 px-4 py-2 text-sm">
                                {dataInfo}
                              </TableCell>
                              <TableCell className="border border-gray-300 px-4 py-2">
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => handleRestoreTest(test)}
                                  color="primary"
                                  startIcon={<Restore />}
                                  disabled={!test.data || !test.analysis}
                                >
                                  Восстановить
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
                
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => {
                      localStorage.removeItem('testHistory');
                      setSnackbarMessage('История тестов очищена');
                      setOpenSnackbar(true);
                      setShowHistory(false);
                    }}
                  >
                    Очистить историю
                  </Button>
                </div>
              </Box>
            </Collapse>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
          <Button
            variant="contained"
            onClick={handleExportCSV}
            color="success"
            className="flex-1"
          >
            Экспорт в CSV
          </Button>
          <Button
            variant="contained"
            onClick={handleExportXLSX}
            color="success"
            className="flex-1"
          >
            Экспорт в XLSX
          </Button>
        </div>

        <Snackbar 
          open={openSnackbar} 
          autoHideDuration={6000} 
          onClose={() => setOpenSnackbar(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert 
            onClose={() => setOpenSnackbar(false)} 
            severity={snackbarMessage.includes('Предупреждение') || snackbarMessage.includes('Ошибка') ? 'warning' : 'success'} 
            sx={{ width: '100%' }}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
};

export default ResultSummary;
