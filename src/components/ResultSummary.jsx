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

const ResultSummary = ({ analysis, data, setAnalysis, setData, significanceLevel, includeOutliers }) => {
  const distributions = ['Poisson', 'Binomial', 'NegativeBinomial'];
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [testHistory, setTestHistory] = useState([]);

  // ДОБАВЛЕНО: загрузка истории тестов при монтировании компонента
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('testHistory');
      if (savedHistory) {
        const parsedHistory = JSON.parse(savedHistory);
        setTestHistory(Array.isArray(parsedHistory) ? parsedHistory : []);
      }
    } catch (error) {
      console.error('Ошибка загрузки истории тестов:', error);
      setTestHistory([]);
    }
  }, []);

  // ИСПРАВЛЕНО: функция для получения правильных степеней свободы для каждого распределения
  const getDegreesOfFreedom = (dist) => {
    // Приоритет: результаты из chiSquareResults
    if (analysis.chiSquareResults && analysis.chiSquareResults[dist]) {
      return analysis.chiSquareResults[dist].degreesOfFreedom;
    }
    
    // Fallback: объект с df для каждого распределения
    if (typeof analysis.degreesOfFreedom === 'object' && analysis.degreesOfFreedom[dist]) {
      return analysis.degreesOfFreedom[dist];
    }
    
    // ИСПРАВЛЕНО: правильный расчет df на основе типа распределения
    const validBins = analysis.validBins || 11; // Количество интервалов
    
    if (dist === 'Poisson') {
      return Math.max(1, validBins - 1 - 1); // λ - 1 параметр
    } else if (dist === 'Binomial') {
      return Math.max(1, validBins - 1 - 2); // n, p - 2 параметра
    } else if (dist === 'NegativeBinomial') {
      return Math.max(1, validBins - 1 - 2); // ИСПРАВЛЕНО: r, p - тоже 2 параметра!
    }
    
    // Последний fallback
    return analysis.degreesOfFreedom || 9;
  };

  // ИСПРАВЛЕНО: расчет критического значения для конкретного распределения
  const calculateCriticalValue = (dist, significanceLevel) => {
    const df = getDegreesOfFreedom(dist); // ИСПРАВЛЕНО: получаем df для конкретного распределения
    return isFinite(df) && df > 0 ? jStat.chisquare.inv(1 - significanceLevel, df) : 'N/A';
  };

  // ИСПРАВЛЕНО: расчет критических значений для всех распределений
  const calculateCriticalValues = (significanceLevel) => {
    const criticalValues = {};
    
    distributions.forEach((dist) => {
      criticalValues[dist] = calculateCriticalValue(dist, significanceLevel); // ИСПРАВЛЕНО: передаем dist
    });
    
    return criticalValues;
  };

  // ИСПРАВЛЕНО: проверка принятия гипотезы для конкретного распределения
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
      const newCriticalValues = calculateCriticalValues(value); // ИСПРАВЛЕНО: используем исправленную функцию
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

  // ДОБАВЛЕНО: функция для переключения отображения истории
  const handleToggleHistory = () => {
    setShowHistory(!showHistory);
  };

  // ДОБАВЛЕНО: функция для получения лучшего распределения
  const getBestDistribution = (testAnalysis) => {
    if (!testAnalysis) return null;
    return testAnalysis.distribution || 'Не определено';
  };

  // ДОБАВЛЕНО: функция для восстановления теста из истории
  const handleRestoreTest = (test) => {
    if (test.data && test.analysis) {
      setData(test.data);
      setAnalysis(test.analysis);
      setSnackbarMessage('Тест успешно восстановлен из истории');
      setOpenSnackbar(true);
    } else {
      setSnackbarMessage('Ошибка: невозможно восстановить тест - отсутствуют данные');
      setOpenSnackbar(true);
    }
  };

  // УЛУЧШЕННАЯ функция экспорта в CSV с аналитической информацией
  const handleExportCSV = () => {
    try {
      if (!analysis) {
        setSnackbarMessage('Нет результатов анализа для экспорта');
        setOpenSnackbar(true);
        return;
      }

      // Подготавливаем аналитические данные
      const analyticalData = prepareAnalyticalData();
      
      const csvContent = [
        // Заголовки основных результатов
        'РЕЗУЛЬТАТЫ СТАТИСТИЧЕСКОГО АНАЛИЗА ДЕФЕКТОВ',
        '',
        'Параметр,Значение',
        ...analyticalData.summary.map(row => `${row.parameter},${row.value}`),
        '',
        
        // Результаты по распределениям
        'ДЕТАЛЬНЫЕ РЕЗУЛЬТАТЫ ПО РАСПРЕДЕЛЕНИЯМ',
        '',
        'Распределение,χ²,Критическое значение,p-значение,Степени свободы,Статус гипотезы',
        ...analyticalData.distributions.map(row => 
          `${row.name},${row.chi2},${row.critical},${row.pValue},${row.df},${row.status}`
        ),
        '',
        
        // Параметры лучшего распределения
        'ПАРАМЕТРЫ ЛУЧШЕГО РАСПРЕДЕЛЕНИЯ',
        '',
        'Параметр,Значение',
        ...analyticalData.parameters.map(row => `${row.parameter},${row.value}`),
        '',
        
        // Доверительные интервалы
        'ДОВЕРИТЕЛЬНЫЕ ИНТЕРВАЛЫ (95%)',
        '',
        'Параметр,Нижняя граница,Верхняя граница',
        ...analyticalData.confidenceIntervals.map(row => 
          `${row.parameter},${row.lower},${row.upper}`
        ),
        '',
        
        // Выводы и рекомендации
        'ВЫВОДЫ И РЕКОМЕНДАЦИИ',
        '',
        'Заключение,Описание',
        ...analyticalData.conclusions.map(row => `${row.conclusion},${row.description}`),
        '',
        
        // Информация о графике
        'ИНФОРМАЦИЯ О ГРАФИКАХ',
        '',
        'Элемент,Описание',
        ...analyticalData.chartInfo.map(row => `${row.element},${row.description}`)
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `defect_analysis_report_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();

      setSnackbarMessage('Аналитический CSV отчет успешно экспортирован');
      setOpenSnackbar(true);
    } catch (error) {
      setSnackbarMessage('Ошибка экспорта CSV: ' + error.message);
      setOpenSnackbar(true);
    }
  };

  // УЛУЧШЕННАЯ функция экспорта в XLSX с несколькими листами
  const handleExportXLSX = () => {
    try {
      if (!analysis) {
        setSnackbarMessage('Нет результатов анализа для экспорта');
        setOpenSnackbar(true);
        return;
      }

      const analyticalData = prepareAnalyticalData();
      const wb = XLSX.utils.book_new();

      // 1. Лист "Сводка результатов"
      const summaryWs = XLSX.utils.json_to_sheet(analyticalData.summary.map(row => ({
        'Параметр': row.parameter,
        'Значение': row.value
      })));
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Сводка результатов');

      // 2. Лист "Анализ распределений"
      const distributionsWs = XLSX.utils.json_to_sheet(analyticalData.distributions.map(row => ({
        'Распределение': row.name,
        'χ² статистика': row.chi2,
        'Критическое значение': row.critical,
        'p-значение': row.pValue,
        'Степени свободы': row.df,
        'Статус гипотезы': row.status,
        'Интерпретация': row.interpretation
      })));
      XLSX.utils.book_append_sheet(wb, distributionsWs, 'Анализ распределений');

      // 3. Лист "Параметры и интервалы"
      const parametersData = [
        ...analyticalData.parameters.map(row => ({
          'Тип': 'Параметр распределения',
          'Название': row.parameter,
          'Значение': row.value,
          'Описание': row.description || ''
        })),
        ...analyticalData.confidenceIntervals.map(row => ({
          'Тип': 'Доверительный интервал',
          'Название': row.parameter,
          'Значение': `[${row.lower}; ${row.upper}]`,
          'Описание': row.interpretation || ''
        }))
      ];
      const parametersWs = XLSX.utils.json_to_sheet(parametersData);
      XLSX.utils.book_append_sheet(wb, parametersWs, 'Параметры и интервалы');

      // 4. Лист "Выводы и рекомендации"
      const conclusionsWs = XLSX.utils.json_to_sheet(analyticalData.conclusions.map(row => ({
        'Заключение': row.conclusion,
        'Описание': row.description,
        'Рекомендация': row.recommendation || ''
      })));
      XLSX.utils.book_append_sheet(wb, conclusionsWs, 'Выводы и рекомендации');

      // 5. Лист "Описание графиков"
      const chartWs = XLSX.utils.json_to_sheet(analyticalData.chartInfo.map(row => ({
        'Элемент графика': row.element,
        'Описание': row.description,
        'Интерпретация': row.interpretation || ''
      })));
      XLSX.utils.book_append_sheet(wb, chartWs, 'Описание графиков');

      // 6. Лист "Методология"
      const methodologyData = [
        { 'Раздел': 'Статистические тесты', 'Описание': 'Использован критерий хи-квадрат Пирсона для проверки согласия эмпирических данных с теоретическими распределениями' },
        { 'Раздел': 'Уровень значимости', 'Описание': `α = ${analysis.significanceLevel || 0.05}` },
        { 'Раздел': 'Проверяемые распределения', 'Описание': 'Пуассон, Биномиальное, Отрицательное биномиальное' },
        { 'Раздел': 'Критерий выбора', 'Описание': 'Наибольшее p-значение среди принятых гипотез' },
        { 'Раздел': 'Обработка выбросов', 'Описание': includeOutliers ? 'Выбросы включены в анализ' : 'Выбросы исключены из анализа (99.9% квантиль)' }
      ];
      const methodologyWs = XLSX.utils.json_to_sheet(methodologyData);
      XLSX.utils.book_append_sheet(wb, methodologyWs, 'Методология');

      XLSX.writeFile(wb, `defect_analysis_comprehensive_report_${new Date().toISOString().split('T')[0]}.xlsx`);

      setSnackbarMessage('Комплексный XLSX отчет успешно экспортирован');
      setOpenSnackbar(true);
    } catch (error) {
      setSnackbarMessage('Ошибка экспорта XLSX: ' + error.message);
      setOpenSnackbar(true);
    }
  };

  useEffect(() => {
    if (analysis.significanceLevel) {
      const newCriticalValues = calculateCriticalValues(analysis.significanceLevel); // ИСПРАВЛЕНО
      
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
  }, [analysis.significanceLevel, analysis.theoreticalFrequencies, setAnalysis]);

  // ИСПРАВЛЕНО: в таблице результатов используем правильные df для каждого распределения
  const distributionTableRows = distributions.map((dist) => {
    const chi2 = analysis.chiSquareValues?.[dist] || 0;
    const pValue = analysis.pValues?.[dist] || 0;
    const df = getDegreesOfFreedom(dist); // ИСПРАВЛЕНО: получаем df для конкретного распределения
    const criticalValue = calculateCriticalValue(dist, analysis.significanceLevel || 0.05); // ИСПРАВЛЕНО
    const hypothesisAccepted = isHypothesisAccepted(dist, criticalValue);

    return (
      <TableRow key={dist} className="hover:bg-gray-50">
        <TableCell className="border border-gray-300 px-4 py-2">
          {getDistributionName(dist)}
        </TableCell>
        <TableCell className="border border-gray-300 px-4 py-2">
          {isFinite(chi2) ? chi2.toFixed(3) : 'N/A'}
        </TableCell>
        <TableCell className="border border-gray-300 px-4 py-2">
          {isFinite(criticalValue) ? criticalValue.toFixed(3) : 'N/A'}
          <Typography variant="caption" display="block" className="text-gray-500">
            (df = {df}) {/* ИСПРАВЛЕНО: показываем правильные df для каждого распределения */}
          </Typography>
        </TableCell>
        <TableCell className="border border-gray-300 px-4 py-2">
          {isFinite(pValue) ? (pValue < 0.001 ? pValue.toExponential(2) : pValue.toFixed(4)) : 'N/A'}
        </TableCell>
        <TableCell className={`border border-gray-300 px-4 py-2 ${hypothesisAccepted ? 'text-green-600' : 'text-red-600'}`}>
          {hypothesisAccepted ? 'Принимается' : 'Отвергается'}
        </TableCell>
      </TableRow>
    );
  });

  // ИСПРАВЛЕНО: функции для работы с историей тестов тоже используют правильные df
  const getTestHypothesisStatusForDistribution = (testAnalysis, distribution) => {
    if (!testAnalysis || !testAnalysis.chiSquareValues || !testAnalysis.pValues) {
      return false;
    }
    
    const chi2 = testAnalysis.chiSquareValues[distribution];
    const pValue = testAnalysis.pValues[distribution]; 
    
    // ИСПРАВЛЕНО: используем функцию для получения правильных df
    const df = getDegreesOfFreedom(distribution);
    const sigLevel = testAnalysis.significanceLevel || 0.05;

    if (!isFinite(chi2) || !isFinite(pValue) || !isFinite(df) || df <= 0) {
      return false;
    }

    const isAccepted = pValue >= sigLevel;
    return isAccepted;
  };

  const getOverallTestStatus = (testAnalysis) => {
    if (!testAnalysis) return false;
    
    const statusResults = distributions.map(dist => {
      return getTestHypothesisStatusForDistribution(testAnalysis, dist);
    });
    
    const hasAcceptedHypothesis = statusResults.some(status => status === true);
    return hasAcceptedHypothesis;
  };

  // ПЕРЕМЕЩАЕМ функцию prepareAnalyticalData ВНУТРЬ компонента
  const prepareAnalyticalData = () => {
    const bestDistribution = analysis.distribution;
    const hypothesisStatus = analysis.hypothesisAccepted ? 'Принята' : 'Отвергнута';
    
    // 1. Сводка основных результатов
    const summary = [
      { parameter: 'Дата анализа', value: new Date().toLocaleDateString('ru-RU') },
      { parameter: 'Количество партий', value: data?.length || 0 },
      { parameter: 'Общее количество изделий', value: data?.reduce((sum, row) => sum + row.total, 0) || 0 },
      { parameter: 'Общее количество дефектов', value: data?.reduce((sum, row) => sum + row.defects, 0) || 0 },
      { parameter: 'Средняя доля брака', value: data?.length > 0 ? (data.reduce((sum, row) => sum + (row.defects / row.total), 0) / data.length * 100).toFixed(3) + '%' : 'N/A' },
      { parameter: 'Лучшее распределение', value: getDistributionName(bestDistribution) || 'Не определено' },
      { parameter: 'Общий статус гипотезы', value: hypothesisStatus },
      { parameter: 'Уровень значимости', value: (analysis.significanceLevel * 100).toFixed(1) + '%' }
    ];

    // 2. Детальные результаты по распределениям
    const distributions = ['Poisson', 'Binomial', 'NegativeBinomial'].map(dist => {
      const chi2 = analysis.chiSquareValues?.[dist] || 0;
      const pValue = analysis.pValues?.[dist] || 0;
      const df = getDegreesOfFreedom(dist);
      const criticalValue = calculateCriticalValue(dist, analysis.significanceLevel || 0.05);
      const isAccepted = isHypothesisAccepted(dist, criticalValue);
      
      return {
        name: getDistributionName(dist),
        chi2: chi2.toFixed(3),
        critical: criticalValue.toFixed(3),
        pValue: pValue < 0.001 ? pValue.toExponential(3) : pValue.toFixed(6),
        df: df,
        status: isAccepted ? 'Принята' : 'Отвергнута',
        interpretation: getHypothesisInterpretation(isAccepted, pValue, analysis.significanceLevel)
      };
    });

    // 3. Параметры лучшего распределения
    const parameters = [];
    if (analysis.parameters && bestDistribution) {
      if (bestDistribution === 'Poisson') {
        parameters.push({
          parameter: 'λ (лямбда)',
          value: analysis.parameters.lambda?.toFixed(4) || 'N/A',
          description: 'Параметр интенсивности (среднее количество дефектов)'
        });
      } else if (bestDistribution === 'Binomial') {
        parameters.push(
          {
            parameter: 'n (размер выборки)',
            value: analysis.parameters.n || 'N/A',
            description: 'Количество испытаний в партии'
          },
          {
            parameter: 'p (вероятность успеха)',
            value: analysis.parameters.p?.toFixed(6) || 'N/A',
            description: 'Вероятность появления дефекта'
          }
        );
      } else if (bestDistribution === 'NegativeBinomial') {
        parameters.push(
          {
            parameter: 'r (количество успехов)',
            value: analysis.parameters.r?.toFixed(4) || 'N/A',
            description: 'Параметр формы распределения'
          },
          {
            parameter: 'p (вероятность успеха)',
            value: analysis.parameters.p?.toFixed(6) || 'N/A',
            description: 'Вероятность успеха в каждом испытании'
          }
        );
      }
    }

    // 4. Доверительные интервалы
    const confidenceIntervals = [
      {
        parameter: 'Среднее количество дефектов',
        lower: analysis.meanCI?.[0]?.toFixed(3) || 'N/A',
        upper: analysis.meanCI?.[1]?.toFixed(3) || 'N/A',
        interpretation: 'С вероятностью 95% истинное среднее находится в этом интервале'
      },
      {
        parameter: 'Дисперсия количества дефектов',
        lower: analysis.varianceCI?.[0]?.toFixed(3) || 'N/A',
        upper: analysis.varianceCI?.[1]?.toFixed(3) || 'N/A',
        interpretation: 'С вероятностью 95% истинная дисперсия находится в этом интервале'
      }
    ];

    // 5. Выводы и рекомендации
    const conclusions = generateConclusions(bestDistribution, hypothesisStatus, analysis);

    // 6. Информация о графиках
    const chartInfo = [
      {
        element: 'Столбчатая диаграмма (синий)',
        description: 'Эмпирические частоты - фактическое распределение дефектов по партиям',
        interpretation: 'Показывает реальную картину распределения брака'
      },
      {
        element: 'Линия Пуассона (красный)',
        description: 'Теоретические частоты распределения Пуассона',
        interpretation: 'Подходит для моделирования редких событий с постоянной интенсивностью'
      },
      {
        element: 'Линия Биномиального (голубой)',
        description: 'Теоретические частоты биномиального распределения',
        interpretation: 'Подходит для моделирования количества успехов в фиксированном числе испытаний'
      },
      {
        element: 'Линия Отрицательного биномиального (желтый)',
        description: 'Теоретические частоты отрицательного биномиального распределения',
        interpretation: 'Подходит для моделирования сверхдисперсных данных'
      },
      {
        element: 'График хи-квадрат',
        description: 'Распределение хи-квадрат с отмеченными критическими значениями',
        interpretation: `Показывает области принятия/отвержения гипотез при α=${(analysis.significanceLevel * 100).toFixed(1)}%`
      }
    ];

    return {
      summary,
      distributions,
      parameters,
      confidenceIntervals,
      conclusions,
      chartInfo
    };
  };

  // ПЕРЕМЕЩАЕМ функцию generateConclusions ВНУТРЬ компонента
  const generateConclusions = (bestDistribution, hypothesisStatus, analysis) => {
    const conclusions = [];

    // Основной вывод
    if (bestDistribution && hypothesisStatus === 'Принята') {
      conclusions.push({
        conclusion: 'Основной вывод',
        description: `Данные хорошо согласуются с ${getDistributionName(bestDistribution)} распределением`,
        recommendation: `Рекомендуется использовать ${getDistributionName(bestDistribution)} распределение для моделирования процесса`
      });
    } else {
      conclusions.push({
        conclusion: 'Основной вывод',
        description: 'Ни одно из проверяемых распределений не показало хорошего согласия с данными',
        recommendation: 'Требуется дополнительное исследование или рассмотрение других типов распределений'
      });
    }

    // Анализ качества процесса
    const totalDefects = data?.reduce((sum, row) => sum + row.defects, 0) || 0;
    const totalItems = data?.reduce((sum, row) => sum + row.total, 0) || 1;
    const defectRate = totalDefects / totalItems;

    if (defectRate < 0.01) {
      conclusions.push({
        conclusion: 'Качество процесса',
        description: `Доля брака составляет ${(defectRate * 100).toFixed(2)}% - процесс контролируется хорошо`,
        recommendation: 'Поддерживать текущий уровень контроля качества'
      });
    } else if (defectRate < 0.05) {
      conclusions.push({
        conclusion: 'Качество процесса',
        description: `Доля брака составляет ${(defectRate * 100).toFixed(2)}% - процесс находится в допустимых пределах`,
        recommendation: 'Рассмотреть возможности улучшения процесса'
      });
    } else {
      conclusions.push({
        conclusion: 'Качество процесса',
        description: `Доля брака составляет ${(defectRate * 100).toFixed(2)}% - высокий уровень брака`,
        recommendation: 'Необходимы срочные меры по улучшению процесса и контролю качества'
      });
    }

    // Рекомендации по контролю
    if (bestDistribution === 'Poisson') {
      conclusions.push({
        conclusion: 'Рекомендации по контролю',
        description: 'Процесс характеризуется случайными дефектами с постоянной интенсивностью',
        recommendation: 'Использовать u-карты для статистического контроля процесса'
      });
    } else if (bestDistribution === 'NegativeBinomial') {
      conclusions.push({
        conclusion: 'Рекомендации по контролю',
        description: 'Процесс показывает сверхдисперсию - изменчивость выше ожидаемой',
        recommendation: 'Исследовать причины повышенной вариабельности, возможно применение специальных карт контроля'
      });
    }

    return conclusions;
  };

  // ПЕРЕМЕЩАЕМ функцию getHypothesisInterpretation ВНУТРЬ компонента
  const getHypothesisInterpretation = (isAccepted, pValue, alpha) => {
    if (isAccepted) {
      if (pValue > 0.1) {
        return 'Сильные доказательства в пользу гипотезы';
      } else if (pValue > 0.05) {
        return 'Умеренные доказательства в пользу гипотезы';
      } else {
        return 'Слабые доказательства в пользу гипотезы';
      }
    } else {
      if (pValue < 0.001) {
        return 'Очень сильные доказательства против гипотезы';
      } else if (pValue < 0.01) {
        return 'Сильные доказательства против гипотезы';
      } else {
        return 'Умеренные доказательства против гипотезы';
      }
    }
  };

  // Остальная часть JSX остается такой же...
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
              {distributionTableRows}
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
                      setTestHistory([]); // ДОБАВЛЕНО: очищаем состояние
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
