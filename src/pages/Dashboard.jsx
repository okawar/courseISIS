import React, { useState, useEffect } from 'react';
import { jStat } from 'jstat';
import DataTable from '../components/DataTable';
import DistributionChart from '../components/DistributionChart';
import ChiSquareVisualization from '../components/ChiSquareVisualization';
import { Grid, Paper, Typography, Snackbar, Alert, Button, ButtonGroup } from '@mui/material';
import ResultSummary from '../components/ResultSummary';
import FileUploader from '../components/FileUploader';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [analysisParams, setAnalysisParams] = useState({});
  const [analysis, setAnalysis] = useState({
    distribution: '',
    suggestedDistribution: '',
    parameters: {},
    theoreticalFrequencies: { Poisson: [], Binomial: [], Normal: [] },
    empiricalFrequencies: [],
    chiSquareValues: { Poisson: 0, Binomial: 0, Normal: 0, criticalValue: 0 },
    pValues: { Poisson: 0, Binomial: 0, Normal: 0 },
    degreesOfFreedom: 0,
    significanceLevel: 0.05,
    hypothesisAccepted: false,
    binLabels: [],
  });
  const [error, setError] = useState(null);

  const log = (level, message, data = {}) => {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    const logLevels = { error: true, info: true, debug: false };
    if (logLevels[level]) {
      console.log(`[DefectAnalyzer - ${timestamp}] ${level.toUpperCase()}: ${message}`, { ...data, timestamp });
    }
  };

  const binomialSample = (n, p) => {
    if (p < 0 || p > 1) throw new Error('p должно быть в диапазоне [0, 1]');
    if (n <= 0) throw new Error('n должно быть положительным');
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < p) count++;
    }
    return count;
  };

  const generateData = (distributionType, totalItems, params = {}, useRandomParams = false) => {
    log('info', 'Начало генерации данных', { distributionType, totalItemsLength: totalItems.length, useRandomParams });
    let defects = [];
    let finalParams = {};

    try {
      if (distributionType === 'Poisson') {
        const lambda = useRandomParams ? Math.random() * 10 + 5 : params.lambda || 10;
        if (lambda <= 0) throw new Error('λ должно быть положительным');
        defects = totalItems.map(total => Math.min(Math.round(jStat.poisson.sample(lambda)), total));
        finalParams = { lambda };
      } else if (distributionType === 'Binomial') {
        const n = useRandomParams ? Math.round(Math.random() * 50 + 50) : params.n || 100;
        const p = useRandomParams ? Math.random() * 0.1 + 0.05 : params.p || 0.1;
        if (p <= 0 || p >= 1) throw new Error('p должно быть в диапазоне (0, 1)');
        if (n <= 0) throw new Error('n должно быть положительным');
        defects = totalItems.map(total => Math.min(binomialSample(n, p), total));
        finalParams = { n, p };
      } else if (distributionType === 'Normal') {
        const mean = useRandomParams ? Math.random() * 10 + 5 : params.mean || 10;
        const stdDev = useRandomParams ? Math.random() * 3 + 1 : params.stdDev || 2;
        if (stdDev <= 0) throw new Error('stdDev должно быть положительным');
        defects = totalItems.map(total => Math.min(Math.round(jStat.normal.sample(mean, stdDev)), total));
        finalParams = { mean, stdDev };
      } else {
        throw new Error('Некорректный тип распределения');
      }

      const testData = totalItems.map((total, i) => ({
        total,
        defects: Math.max(0, defects[i]),
      }));

      log('info', 'Данные сгенерированы', { distributionType, params: finalParams, totalRecords: testData.length });
      return { testData, params: finalParams };
    } catch (err) {
      log('error', 'Ошибка генерации данных', { error: err.message });
      throw new Error(`Ошибка генерации данных: ${err.message}`);
    }
  };

  const handleGenerateTestData = (distributionType) => {
    log('info', 'Запуск генерации тестовых данных', { distributionType });
    const totalItems = Array.from({ length: 100000 }, () => Math.floor(Math.random() * 200) + 50);
    try {
      const { testData, params } = generateData(distributionType, totalItems, {}, true);
      log('info', 'Тестовые данные успешно сгенерированы', { distributionType, params });
      setData(testData);
      setAnalysisParams(params);
      setError(null);
    } catch (err) {
      log('error', 'Ошибка при генерации тестовых данных', { error: err.message });
      setError(err.message);
    }
  };

  const generateOptimalData = (distributionType) => {
    log('info', 'Запуск генерации оптимальных данных', { distributionType });
    const totalItems = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 200) + 50);
    try {
      const { testData, params } = generateData(distributionType, totalItems);
      log('info', 'Оптимальные данные успешно сгенерированы', { distributionType, params });
      setData(testData);
      setAnalysisParams(params);
      setError(null);
    } catch (err) {
      log('error', 'Ошибка при генерации оптимальных данных', { error: err.message });
      setError(err.message);
    }
  };

  const analyzeDataForHypothesis = (defects, totalItems) => {
    const n = defects.length;
    const mean = defects.reduce((sum, val) => sum + val, 0) / n;
    const variance = defects.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(n - 1, 1);
    const stdDev = Math.sqrt(variance) || 0.0001;
    const totalDefects = defects.reduce((sum, val) => sum + val, 0);
    const defectRate = totalItems > 0 ? totalDefects / totalItems : 0;

    const skewness = n > 0 ? defects.reduce((sum, val) => sum + Math.pow(val - mean, 3), 0) / (n * Math.pow(stdDev, 3)) : 0;

    let scores = {
      Poisson: 0,
      Binomial: 0,
      Normal: 0,
    };

    if (Math.abs(variance - mean) / mean < 0.2 && defectRate < 0.1) {
      scores.Poisson = 0.8;
    }

    if (defectRate < 0.2 && n > 10) {
      scores.Binomial = 0.7;
    }

    if (n > 30 && Math.abs(skewness) < 0.5) {
      scores.Normal = 0.9;
    }

    const suggestedDistribution = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    log('info', 'Предложенное распределение', { suggestedDistribution, mean, variance, skewness, defectRate });
    return suggestedDistribution;
  };

  useEffect(() => {
    log('info', 'Запуск обработки данных', { dataLength: data.length });

    if (data.length === 0) {
      const errorMsg = 'Ошибка: данные отсутствуют. Пожалуйста, загрузите данные или сгенерируйте тестовые данные.';
      log('error', 'Данные отсутствуют', { error: errorMsg });
      setError(errorMsg);
      return;
    }

    const isValid = data.every((row, i) => {
      if (row.total < 0 || row.defects < 0) {
        log('error', `Некорректные данные в строке ${i + 1}`, { total: row.total, defects: row.defects });
        return false;
      }
      if (row.defects > row.total) {
        log('error', `Бракованных деталей больше общего количества в строке ${i + 1}`, { total: row.total, defects: row.defects });
        return false;
      }
      if (isNaN(row.total) || isNaN(row.defects)) {
        log('error', `NaN обнаружен в строке ${i + 1}`, { total: row.total, defects: row.defects });
        return false;
      }
      return true;
    });

    if (!isValid) {
      const errorMsg = 'Ошибка: обнаружены некорректные данные (отрицательные значения, NaN или defects > total). Проверьте данные.';
      setError(errorMsg);
      return;
    }

    const defects = data.map(item => item.defects || 0);
    const n = defects.length;
    const mean = defects.reduce((sum, val) => sum + val, 0) / n;
    if (isNaN(mean) || !isFinite(mean)) {
      const errorMsg = 'Ошибка: невозможно вычислить среднее значение из-за некорректных данных.';
      log('error', 'Ошибка вычисления среднего', { mean });
      setError(errorMsg);
      return;
    }

    const variance = defects.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(n - 1, 1);
    const stdDev = Math.sqrt(variance) || 0.0001;
    if (isNaN(stdDev) || !isFinite(stdDev)) {
      const errorMsg = 'Ошибка: невозможно вычислить стандартное отклонение из-за некорректных данных.';
      log('error', 'Ошибка вычисления stdDev', { variance, stdDev });
      setError(errorMsg);
      return;
    }

    const maxDefects = Math.max(...defects);
    const totalItems = data.reduce((sum, row) => sum + row.total, 0);
    const totalDefects = defects.reduce((sum, val) => sum + val, 0);
    const defectRate = totalItems > 0 ? totalDefects / totalItems : 0;

    const suggestedDistribution = analyzeDataForHypothesis(defects, totalItems);

    log('info', 'Основные статистики', { n, mean, variance, stdDev, maxDefects, totalItems, totalDefects, defectRate });

    const empiricalFrequencies = Array(maxDefects + 1).fill(0);
    defects.forEach(d => empiricalFrequencies[d]++);

    const logFactorial = (n) => {
      if (n <= 1) return 0;
      let result = 0;
      for (let i = 1; i <= n; i++) {
        result += Math.log(i);
      }
      return result;
    };

    const normalizeFrequencies = (freqs, total) => {
      const sum = freqs.reduce((s, f) => s + f, 0);
      if (sum <= 0) return freqs.map(() => 0.0001);
      return freqs.map(f => (f / sum) * total);
    };

    const poissonFrequencies = normalizeFrequencies(
      Array(maxDefects + 1).fill(0).map((_, k) => {
        const lambda = mean;
        if (lambda <= 0) return 0;
        const logProb = k * Math.log(lambda) - lambda - logFactorial(k);
        const prob = Math.exp(logProb);
        return isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * n;
      }),
      n
    );

    const binomialP = totalItems > 0 ? totalDefects / totalItems : 0.1;
    const binomialN = Math.round(mean / binomialP); // Оценка n по среднему
    const binomialFrequencies = normalizeFrequencies(
      Array(maxDefects + 1).fill(0).map((_, k) => {
        if (k > binomialN) return 0;
        const logCoef = logFactorial(binomialN) - logFactorial(k) - logFactorial(binomialN - k);
        const logProb = logCoef + k * Math.log(binomialP) + (binomialN - k) * Math.log(1 - binomialP);
        const prob = Math.exp(logProb);
        return isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * n;
      }),
      n
    );

    const normalFrequencies = normalizeFrequencies(
      Array(maxDefects + 1).fill(0).map((_, k) => {
        const prob = jStat.normal.cdf(k + 0.5, mean, stdDev) - jStat.normal.cdf(k - 0.5, mean, stdDev);
        return isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * n;
      }),
      n
    );

    log('info', 'Параметры распределений', {
      poisson: { lambda: mean },
      binomial: { n: binomialN, p: binomialP },
      normal: { mean, stdDev }
    });

    const createOptimalBins = (empiricalFreqs, poissonFreqs, binomialFreqs, normalFreqs, minFrequency = 5) => {
      const totalCount = empiricalFreqs.reduce((sum, val) => sum + val, 0);
      const sturgesK = Math.ceil(Math.log2(totalCount) + 1);
      let binCount = Math.max(5, Math.min(sturgesK, 20));

      log('info', 'Расчет начального количества интервалов', { totalCount, sturgesK, binCount });

      if (empiricalFreqs.length <= binCount) {
        const bins = empiricalFreqs.map((_, i) => [i, i]).filter((_, i) => empiricalFreqs[i] > 0);
        log('info', 'Использовано простое разбиение', { binCount: bins.length });
        return bins.length > 0 ? bins : [[0, 0]];
      }

      let bins = [];
      let finalBins = [];
      let binWidth = Math.max(1, Math.floor(empiricalFreqs.length / binCount));
      let allAboveMinAchieved = false;

      while (!allAboveMinAchieved && binWidth <= Math.floor(empiricalFreqs.length / 3)) {
        bins = [];
        for (let i = 0; i < empiricalFreqs.length; i += binWidth) {
          const start = i;
          const end = Math.min(i + binWidth - 1, empiricalFreqs.length - 1);
          bins.push([start, end]);
        }

        finalBins = [];
        let currentBin = null;

        const calculateExpectedFrequencies = (bins, freqs) => {
          return bins.map(([start, end]) => {
            let sum = 0;
            for (let k = start; k <= end; k++) {
              sum += (freqs[k] || 0);
            }
            return sum;
          });
        };

        for (let i = 0; i < bins.length; i++) {
          const [start, end] = bins[i];
          if (currentBin === null) {
            currentBin = [start, end];
          } else {
            const tempBins = [...finalBins, currentBin, [start, end]];
            const tempPoisson = calculateExpectedFrequencies(tempBins, poissonFreqs);
            const tempBinomial = calculateExpectedFrequencies(tempBins, binomialFreqs);
            const tempNormal = calculateExpectedFrequencies(tempBins, normalFreqs);

            const lastPoisson = tempPoisson[tempPoisson.length - 1];
            const lastBinomial = tempBinomial[tempBinomial.length - 1];
            const lastNormal = tempNormal[tempNormal.length - 1];
            const secondLastPoisson = tempPoisson[tempPoisson.length - 2] || 0;
            const secondLastBinomial = tempBinomial[tempBinomial.length - 2] || 0;
            const secondLastNormal = tempNormal[tempNormal.length - 2] || 0;

            if (
              (secondLastPoisson < minFrequency || secondLastBinomial < minFrequency || secondLastNormal < minFrequency) ||
              (lastPoisson < minFrequency || lastBinomial < minFrequency || lastNormal < minFrequency)
            ) {
              currentBin[1] = end;
            } else {
              finalBins.push(currentBin);
              currentBin = [start, end];
            }
          }
        }

        if (currentBin !== null) {
          finalBins.push(currentBin);
        }

        const finalPoisson = calculateExpectedFrequencies(finalBins, poissonFreqs);
        const finalBinomial = calculateExpectedFrequencies(finalBins, binomialFreqs);
        const finalNormal = calculateExpectedFrequencies(finalBins, normalFreqs);

        const allAboveMin = (freqs) => freqs.every(f => f >= minFrequency);
        allAboveMinAchieved = allAboveMin(finalPoisson) && allAboveMin(finalBinomial) && allAboveMin(finalNormal);

        if (!allAboveMinAchieved) {
          binWidth++;
          binCount--;
          log('info', 'Увеличение binWidth для обеспечения минимальной частоты', { binWidth, binCount });
        }
      }

      if (finalBins.length < 5) {
        binCount = 5;
        binWidth = Math.max(1, Math.floor(empiricalFreqs.length / binCount));
        finalBins = [];
        for (let i = 0; i < empiricalFreqs.length; i += binWidth) {
          const start = i;
          const end = Math.min(i + binWidth - 1, empiricalFreqs.length - 1);
          finalBins.push([start, end]);
        }
        log('info', 'Использовано минимальное разбиение', { binCount: finalBins.length });
      }

      log('info', 'Создано оптимальное разбиение на интервалы', { binCount: finalBins.length, bins: finalBins });
      return finalBins;
    };

    const bins = createOptimalBins(empiricalFrequencies, poissonFrequencies, binomialFrequencies, normalFrequencies);
    const binLabels = bins.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`));

    const binnedEmpirical = Array(bins.length).fill(0);
    const binnedPoisson = Array(bins.length).fill(0);
    const binnedBinomial = Array(bins.length).fill(0);
    const binnedNormal = Array(bins.length).fill(0);

    for (let i = 0; i < bins.length; i++) {
      const [start, end] = bins[i];
      for (let k = start; k <= end; k++) {
        binnedEmpirical[i] += empiricalFrequencies[k] || 0;
        binnedPoisson[i] += poissonFrequencies[k] || 0;
        binnedBinomial[i] += binomialFrequencies[k] || 0;
        binnedNormal[i] += normalFrequencies[k] || 0;
      }
    }

    const validateFrequencies = (freqs, distName) => {
      const validCount = freqs.filter(f => f >= 5).length;
      const totalBins = freqs.filter(f => f > 0).length;
      const validRatio = totalBins > 0 ? validCount / totalBins : 0;
      
      if (validRatio < 1 && totalBins >= 3) {
        const warning = `Предупреждение: ${Math.round((1-validRatio)*100)}% ожидаемых частот < 5 для ${distName}, тест может быть ненадёжным`;
        log('info', 'Проверка частот', { distName, validRatio, warning });
      }
      return validRatio === 1;
    };

    validateFrequencies(binnedPoisson, 'Poisson');
    validateFrequencies(binnedBinomial, 'Binomial');
    validateFrequencies(binnedNormal, 'Normal');

    const computeChi2 = (observed, expected, distName) => {
      let sum = 0;
      for (let i = 0; i < observed.length; i++) {
        const o = observed[i];
        const e = expected[i];
        if (e >= 5) {
          const contribution = Math.pow(o - e, 2) / e;
          sum += contribution;
        }
      }
      return isNaN(sum) || !isFinite(sum) ? Infinity : sum;
    };

    const chi2_poisson = computeChi2(binnedEmpirical, binnedPoisson, 'Poisson');
    const chi2_binomial = computeChi2(binnedEmpirical, binnedBinomial, 'Binomial');
    const chi2_normal = computeChi2(binnedEmpirical, binnedNormal, 'Normal');

    const k = bins.length;
    const df_poisson = Math.max(k - 1 - 1, 1);
    const df_binomial = Math.max(k - 1 - 2, 1);
    const df_normal = Math.max(k - 1 - 2, 1);

    const getCriticalValue = (df) => jStat.chisquare.inv(1 - analysis.significanceLevel, df);
    const critical_poisson = getCriticalValue(df_poisson);
    const critical_binomial = getCriticalValue(df_binomial);
    const critical_normal = getCriticalValue(df_normal);

    console.log('Critical Values in Dashboard:', { critical_poisson, critical_binomial, critical_normal }); // Отладка

    const computePValue = (chi2, df) => {
      if (!isFinite(chi2) || df <= 0) return 0;
      return 1 - jStat.chisquare.cdf(chi2, df);
    };

    const pValuePoisson = computePValue(chi2_poisson, df_poisson);
    const pValueBinomial = computePValue(chi2_binomial, df_binomial);
    const pValueNormal = computePValue(chi2_normal, df_normal);

    const results = [
      { name: 'Poisson', chi2: chi2_poisson, params: { lambda: mean }, expected: binnedPoisson, pValue: pValuePoisson, df: df_poisson, critical: critical_poisson },
      { name: 'Binomial', chi2: chi2_binomial, params: { n: binomialN, p: binomialP }, expected: binnedBinomial, pValue: pValueBinomial, df: df_binomial, critical: critical_binomial },
      { name: 'Normal', chi2: chi2_normal, params: { mean, stdDev }, expected: binnedNormal, pValue: pValueNormal, df: df_normal, critical: critical_normal },
    ];

    const accepted = results.filter(r => r.chi2 < r.critical && isFinite(r.chi2) && r.pValue > analysis.significanceLevel);
    const best = accepted.length > 0
      ? accepted.reduce((min, r) => r.chi2 < min.chi2 ? r : min)
      : results.reduce((min, r) => (isFinite(r.chi2) && r.chi2 < min.chi2) ? r : min, { chi2: Infinity });

    log('info', 'Результаты анализа', {
      acceptedDistributions: accepted.map(r => r.name),
      bestDistribution: best.name,
      chiSquareValues: { Poisson: chi2_poisson, Binomial: chi2_binomial, Normal: chi2_normal },
      pValues: { Poisson: pValuePoisson, Binomial: pValueBinomial, Normal: pValueNormal },
      binCount: bins.length
    });

    setAnalysis({
      distribution: best.name || '',
      suggestedDistribution,
      parameters: best.params || {},
      empiricalFrequencies: binnedEmpirical,
      theoreticalFrequencies: {
        Poisson: binnedPoisson,
        Binomial: binnedBinomial,
        Normal: binnedNormal,
      },
      chiSquareValues: {
        Poisson: isFinite(chi2_poisson) ? chi2_poisson : Infinity,
        Binomial: isFinite(chi2_binomial) ? chi2_binomial : Infinity,
        Normal: isFinite(chi2_normal) ? chi2_normal : Infinity,
        criticalValue: best.critical,
      },
      pValues: {
        Poisson: pValuePoisson,
        Binomial: pValueBinomial,
        Normal: pValueNormal,
      },
      degreesOfFreedom: best.df,
      significanceLevel: analysis.significanceLevel,
      hypothesisAccepted: best.chi2 < best.critical && isFinite(best.chi2) && best.pValue > analysis.significanceLevel,
      chiSquareValue: best.chi2,
      pValue: best.pValue,
      binLabels,
    });

    if (!error) setError(null);
    log('info', 'Анализ завершён');
  }, [data, analysis.significanceLevel, analysisParams]);

  const handleCloseSnackbar = () => {
    log('info', 'Закрытие уведомления', { error });
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-600 text-white py-4 px-6 shadow-md">
        <Typography variant="h4" className="font-bold text-center">
          DefectAnalyzer
        </Typography>
        <Typography variant="subtitle1" className="text-center opacity-80">
          Анализ качества производства деталей
        </Typography>
      </header>

      <Grid container spacing={2} sx={{ p: { xs: 2, sm: 4, lg: 6 }, maxWidth: '7xl', mx: 'auto' }}>
        <Grid sx={{ width: { xs: '100%', md: '45%' } }}>
          <Paper elevation={4} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 'xl', bgcolor: 'white', '&:hover': { boxShadow: 'xl' }, height: '100%' }}>
            <Typography variant="h6" sx={{ color: 'gray.800', fontWeight: 'semibold', mb: 2, textAlign: 'center' }}>
              Загрузка данных
            </Typography>
            <FileUploader setData={setData} data={data} analysis={analysis} />
            <Typography variant="subtitle1" sx={{ color: 'gray.800', mt: 2, mb: 1, textAlign: 'center' }}>
              Сгенерировать тестовые данные:
            </Typography>
            <ButtonGroup variant="contained" color="primary" fullWidth sx={{ mb: 1 }}>
              <Button onClick={() => handleGenerateTestData()}>
                Случайное
              </Button>
              <Button onClick={() => handleGenerateTestData('Poisson')}>
                Пуассона
              </Button>
            </ButtonGroup>
            <ButtonGroup variant="contained" color="primary" fullWidth sx={{ mb: 2 }}>
              <Button onClick={() => handleGenerateTestData('Binomial')}>
                Биномиальное
              </Button>
              <Button onClick={() => handleGenerateTestData('Normal')}>
                Нормальное
              </Button>
            </ButtonGroup>
            <Typography variant="subtitle1" sx={{ color: 'gray.800', mt: 2, mb: 1, textAlign: 'center' }}>
              Идеальные данные для:
            </Typography>
            <ButtonGroup variant="contained" color="secondary" fullWidth>
              <Button onClick={() => generateOptimalData('Poisson')}>
                Пуассона
              </Button>
              <Button onClick={() => generateOptimalData('Binomial')}>
                Биномиальное
              </Button>
              <Button onClick={() => generateOptimalData('Normal')}>
                Нормальное
              </Button>
            </ButtonGroup>
          </Paper>
        </Grid>

        <Grid sx={{ width: { xs: '100%', md: '50%' } }}>
          <Paper elevation={4} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 'xl', bgcolor: 'white', '&:hover': { boxShadow: 'xl' }, height: '100%' }}>
            <Typography variant="h6" sx={{ color: 'gray.800', fontWeight: 'semibold', mb: 2 }}>
              Данные о партиях
            </Typography>
            <DataTable data={data} setData={setData} />
          </Paper>
        </Grid>

        <Grid container spacing={2}>
          <Grid sx={{ width: { xs: '100%', md: '100%' }}}>
            <Paper elevation={4} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 'xl', bgcolor: 'white', '&:hover': { boxShadow: 'xl' }, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'gray.800', fontWeight: 'semibold', mb: 2 }}>
                Гистограмма частот
              </Typography>
              <DistributionChart data={data} analysis={analysis} />
            </Paper>
          </Grid>

          <Grid sx={{ width: { xs: '100%', md: '100%' } }}>
            <Paper elevation={4} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 'xl', bgcolor: 'white', '&:hover': { boxShadow: 'xl' }, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'gray.800', fontWeight: 'semibold', mb: 2 }}>
                Анализ хи-квадрат
              </Typography>
              <ChiSquareVisualization analysis={analysis} />
            </Paper>
          </Grid>
        </Grid>

        <Grid sx={{ width: '100%' }}>
          <Paper elevation={4} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 'xl', bgcolor: 'white', '&:hover': { boxShadow: 'xl' }, width: '100%' }}>
            <Typography variant="h6" sx={{ color: 'gray.800', fontWeight: 'semibold', mb: 2 }}>
              Результаты анализа
            </Typography>
            <ResultSummary analysis={analysis} data={data} setAnalysis={setAnalysis} setData={setData} significanceLevel={analysis.significanceLevel} />
          </Paper>
        </Grid>
      </Grid>

      <footer className="bg-gray-800 text-white py-4 mt-auto">
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          © {new Date().getFullYear()} DefectAnalyzer. ЯГТУ.
        </Typography>
      </footer>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity="warning" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Dashboard;