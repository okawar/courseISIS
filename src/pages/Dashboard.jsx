import React, { useState, useEffect } from 'react';
import { jStat } from 'jstat';
import DataTable from '../components/DataTable';
import DistributionChart from '../components/DistributionChart';
import ChiSquareVisualization from '../components/ChiSquareVisualization';
import { Grid, Paper, Typography, Snackbar, Alert, FormControlLabel, Checkbox, TextField } from '@mui/material';
import ResultSummary from '../components/ResultSummary';
import FileUploader from '../components/FileUploader';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [includeOutliers, setIncludeOutliers] = useState(false);
  const [outlierThreshold, setOutlierThreshold] = useState(1.5); // Множитель IQR по умолчанию
  const [analysis, setAnalysis] = useState({
    distribution: '',
    suggestedDistribution: '',
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
    outlierImpact: { withOutliers: {}, withoutOutliers: {} }, // Добавлено для анализа влияния
  });
  const [error, setError] = useState(null);

  const log = (level, message, data = {}) => {
    const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    console.log(`[DefectAnalyzer - ${timestamp}] ${level.toUpperCase()}: ${message}`, { ...data, timestamp });
  };

  const filterOutliers = (defects, threshold = 1.5) => {
    const sortedDefects = [...defects].sort((a, b) => a - b);
    const n = defects.length;
    const Q1 = sortedDefects[Math.floor(n * 0.25)];
    const Q3 = sortedDefects[Math.floor(n * 0.75)];
    const IQR = Q3 - Q1;
    const lowerBoundIQR = Q1 - threshold * IQR;
    const upperBoundIQR = Q3 + threshold * IQR;

    const filteredDefects = defects.filter((d, i) => {
      if (d <= upperBoundIQR) {
        return true;
      }
      log('warning', 'Исключен выброс', { index: i, defect: d, lowerBoundIQR, upperBoundIQR });
      return false;
    });

    log('info', 'Фильтрация выбросов', { 
      originalCount: defects.length, 
      filteredCount: filteredDefects.length, 
      Q1, Q3, IQR, lowerBoundIQR, upperBoundIQR, threshold 
    });
    return filteredDefects;
  };

  const suggestDistribution = (defects, totalItems) => {
    const n = defects.length;
    const mean = defects.reduce((sum, val) => sum + val, 0) / n;
    const variance = defects.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(n - 1, 1);
    const defectRate = totalItems > 0 ? defects.reduce((sum, val) => sum + val, 0) / totalItems : 0;
    const binomialP = defectRate;

    const seMean = Math.sqrt(variance / n);
    const dispersionStat = ((n - 1) * variance) / mean;
    const pValueDispersion = 1 - jStat.chisquare.cdf(dispersionStat, n - 1);

    const expectedBinomialVariance = totalItems / n * binomialP * (1 - binomialP);
    let scores = {
      Poisson: pValueDispersion > 0.05 ? 0.95 : 0,
      Binomial: Math.abs(variance - expectedBinomialVariance) < 0.1 * expectedBinomialVariance ? 0.95 : 0.90,
      NegativeBinomial: pValueDispersion < 0.05 && variance > mean ? 0.80 : 0,
    };

    const suggestedDistribution = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);

    const chi2Lower = jStat.chisquare.inv(0.975, n - 1);
    const chi2Upper = jStat.chisquare.inv(0.025, n - 1);
    log('debug', 'Квантили хи-квадрат', { chi2Lower, chi2Upper });
    const meanCI = [mean - 1.96 * seMean, mean + 1.96 * seMean];
    const varianceCI = [
      variance * (n - 1) / chi2Lower,
      variance * (n - 1) / chi2Upper,
    ];

    log('info', 'Предложенное распределение', {
      suggestedDistribution,
      mean,
      variance,
      defectRate,
      dispersionStat,
      pValueDispersion,
      seMean,
      meanCI,
      varianceCI,
    });

    return { suggestedDistribution, mean, variance, defectRate, meanCI, varianceCI };
  };

  useEffect(() => {
    log('info', 'Запуск обработки данных', { dataLength: data.length });

    if (data.length === 0) {
      const errorMsg = 'Ошибка: данные отсутствуют. Пожалуйста, загрузите данные.';
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

    const defects = data.map((item, i) => {
      const defect = Number(item.defects) || 0;
      if (isNaN(defect) || defect < 0) {
        log('error', `Некорректное значение defects в строке ${i + 1}`, { defect: item.defects });
        return 0;
      }
      return defect;
    });

    const defectCounts = {};
    defects.forEach(d => defectCounts[d] = (defectCounts[d] || 0) + 1);
    log('debug', 'Распределение defects', { defectCounts });

    const totalItems = data.reduce((sum, row) => sum + row.total, 0);

    // Сохранение статистики с выбросами
    const { suggestedDistribution, mean: meanWithOutliers, variance: varianceWithOutliers, meanCI: meanCIWithOutliers, varianceCI: varianceCIWithOutliers } = 
      suggestDistribution(defects, totalItems);

    // Фильтрация выбросов в зависимости от выбора пользователя
    log('info', 'Обработка выбросов', { includeOutliers, outlierThreshold });
    const filteredDefects = includeOutliers ? defects : filterOutliers(defects, outlierThreshold);

    if (filteredDefects.length === 0) {
      const errorMsg = 'Ошибка: после фильтрации выбросов данные отсутствуют.';
      log('error', 'Данные отсутствуют после фильтрации', { error: errorMsg });
      setError(errorMsg);
      return;
    }

    const { mean, variance, defectRate, meanCI, varianceCI } = suggestDistribution(filteredDefects, totalItems);
    const maxDefects = Math.max(...filteredDefects);

    const empiricalFrequencies = Array(maxDefects + 1).fill(0);
    filteredDefects.forEach(d => empiricalFrequencies[d]++);

    const lambda = mean;
    const poissonFrequencies = Array(maxDefects + 1).fill(0).map((_, k) => {
      const logProb = k * Math.log(lambda) - lambda - jStat.gammaln(k + 1);
      const prob = Math.exp(logProb);
      return isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * filteredDefects.length;
    });

    const binomialParams = data.map(row => ({
      n: row.total,
      p: row.total > 0 ? row.defects / row.total : 0,
      weight: row.total,
    }));
    const totalWeight = binomialParams.reduce((sum, param) => sum + param.weight, 0);
    const binomialP = binomialParams.reduce((sum, param) => sum + param.p * param.weight, 0) / totalWeight;
    const binomialFrequencies = Array(maxDefects + 1).fill(0).map((_, k) => {
      let probSum = 0;
      binomialParams.forEach(({ n }) => {
        if (k > n) return;
        const logCoef = jStat.gammaln(n + 1) - jStat.gammaln(k + 1) - jStat.gammaln(n - k + 1);
        const logProb = logCoef + k * Math.log(binomialP) + (n - k) * Math.log(1 - binomialP);
        const prob = Math.exp(logProb);
        probSum += (isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob) * (n / totalItems);
      });
      return probSum * filteredDefects.length;
    });

    const negBinomialP = variance > mean ? 1 - mean / variance : 0.5;
    const optimizeNegBinomialR = (mean, variance, p) => {
      if (p <= 0 || p >= 1) return 1;
      let r = variance > mean ? (mean * mean) / (variance - mean) : 1;
      const maxIterations = 100;
      const tolerance = 1e-6;
      for (let i = 0; i < maxIterations; i++) {
        const newR = (mean * (1 - p)) / p;
        if (Math.abs(newR - r) < tolerance || !isFinite(newR)) break;
        r = newR;
      }
      return Math.max(1, Math.round(r));
    };
    const negBinomialR = optimizeNegBinomialR(mean, variance, negBinomialP);
    const negBinomialFrequencies = Array(maxDefects + 1).fill(0).map((_, k) => {
      if (negBinomialP <= 0 || negBinomialP >= 1) return 0;
      const logCoef = jStat.gammaln(k + negBinomialR) - jStat.gammaln(k + 1) - jStat.gammaln(negBinomialR);
      const logProb = logCoef + negBinomialR * Math.log(1 - negBinomialP) + k * Math.log(negBinomialP);
      const prob = Math.exp(logProb);
      return isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * filteredDefects.length;
    });

    log('info', 'Параметры распределений', {
      poisson: { lambda },
      binomial: { p: binomialP, adaptiveN: true },
      negativeBinomial: { r: negBinomialR, p: negBinomialP },
    });

    const createOptimalBins = (empiricalFreqs, poissonFreqs, binomialFreqs, negBinomialFreqs) => {
      const totalCount = empiricalFreqs.reduce((sum, val) => sum + val, 0);
      const sturgesK = Math.ceil(1 + Math.log2(totalCount));
      let bins = [];
      let currentBin = [0, 0];

      const addBin = (start, end) => {
        const poissonSum = poissonFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0);
        const binomialSum = binomialFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0);
        const negBinomialSum = negBinomialFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0);
        if (poissonSum >= 5 || binomialSum >= 5 || negBinomialSum >= 5) {
          bins.push([start, end]);
          currentBin = [end + 1, end + 1];
        } else {
          currentBin[1] = end;
        }
      };

      for (let i = 0; i < empiricalFreqs.length; i++) {
        if (i === 0) {
          currentBin = [i, i];
          continue;
        }
        if (bins.length < sturgesK - 1 && i < empiricalFreqs.length - 1) {
          addBin(currentBin[0], i);
        } else {
          if (currentBin[0] <= empiricalFreqs.length - 1) {
            addBin(currentBin[0], empiricalFreqs.length - 1);
          }
          break;
        }
      }

      if (bins.length < 2) {
        log('warning', 'Слишком мало интервалов для анализа', { binCount: bins.length });
        bins = [[0, empiricalFreqs.length - 1]];
      }

      const binnedEmpirical = bins.map(([start, end]) =>
        empiricalFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0)
      );
      const binnedPoisson = bins.map(([start, end]) =>
        poissonFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0)
      );
      const binnedBinomial = bins.map(([start, end]) =>
        binomialFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0)
      );
      const binnedNegBinomial = bins.map(([start, end]) =>
        negBinomialFreqs.slice(start, end + 1).reduce((sum, val) => sum + val, 0)
      );

      log('info', 'Ожидаемые частоты', {
        poisson: binnedPoisson,
        binomial: binnedBinomial,
        negativeBinomial: binnedNegBinomial,
        empirical: binnedEmpirical,
      });

      return { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial };
    };

    const { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial } = createOptimalBins(
      empiricalFrequencies,
      poissonFrequencies,
      binomialFrequencies,
      negBinomialFrequencies
    );
    const binLabels = bins.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`));

    const checkFrequencies = (freqs, distName) => {
      const invalidBins = freqs.filter(f => f < 5).length;
      if (invalidBins > 0) {
        log('info', `Предупреждение: ${invalidBins} интервалов с частотой < 5 для ${distName}`);
      }
    };
    checkFrequencies(binnedPoisson, 'Poisson');
    checkFrequencies(binnedBinomial, 'Binomial');
    checkFrequencies(binnedNegBinomial, 'NegativeBinomial');

    const computeChi2 = (observed, expected, distName, numParams) => {
      let chi2 = 0;
      let validBins = 0;
      const excludedBins = [];
      for (let i = 0; i < observed.length; i++) {
        const o = observed[i];
        const e = expected[i];
        if (e >= 5 && o > 0) {
          chi2 += Math.pow(o - e, 2) / e;
          validBins++;
        } else {
          excludedBins.push(i);
          log('debug', `Интервал ${i} исключён для ${distName}`, { observed: o, expected: e });
        }
      }
      const df = Math.max(validBins - 1 - numParams, 1);
      log('debug', `Хи-квадрат для ${distName}`, { chi2, validBins, df, excludedBins });
      return { chi2: isFinite(chi2) ? chi2 : Infinity, validBins, df };
    };

    const { chi2: chi2_poisson, validBins: validBinsPoisson, df: df_poisson } = computeChi2(binnedEmpirical, binnedPoisson, 'Poisson', 1);
    const { chi2: chi2_binomial, validBins: validBinsBinomial, df: df_binomial } = computeChi2(binnedEmpirical, binnedBinomial, 'Binomial', 2);
    const { chi2: chi2_negBinomial, validBins: validBinsNegBinomial, df: df_negBinomial } = computeChi2(binnedEmpirical, binnedNegBinomial, 'NegativeBinomial', 2);

    const critical_poisson = jStat.chisquare.inv(1 - analysis.significanceLevel, df_poisson);
    const critical_binomial = jStat.chisquare.inv(1 - analysis.significanceLevel, df_binomial);
    const critical_negBinomial = jStat.chisquare.inv(1 - analysis.significanceLevel, df_negBinomial);

    const pValuePoisson = 1 - jStat.chisquare.cdf(chi2_poisson, df_poisson);
    const pValueBinomial = 1 - jStat.chisquare.cdf(chi2_binomial, df_binomial);
    const pValueNegBinomial = 1 - jStat.chisquare.cdf(chi2_negBinomial, df_negBinomial);

    const results = [
      {
        name: 'Poisson',
        chi2: chi2_poisson,
        pValue: pValuePoisson,
        df: df_poisson,
        critical: critical_poisson,
        params: { lambda },
        expected: binnedPoisson,
        fitsData: Math.abs(variance - mean) < 0.1 * mean,
        numParams: 1,
      },
      {
        name: 'Binomial',
        chi2: chi2_binomial,
        pValue: pValueBinomial,
        df: df_binomial,
        critical: critical_binomial,
        params: { p: binomialP, adaptiveN: true },
        expected: binnedBinomial,
        fitsData: defectRate < 0.15 && variance < mean,
        numParams: 2,
      },
      {
        name: 'NegativeBinomial',
        chi2: chi2_negBinomial,
        pValue: pValueNegBinomial,
        df: df_negBinomial,
        critical: critical_negBinomial,
        params: { r: negBinomialR, p: negBinomialP },
        expected: binnedNegBinomial,
        fitsData: variance > mean,
        numParams: 2,
      },
    ];

    const accepted = results.filter(r => r.chi2 < r.critical && isFinite(r.chi2) && r.pValue > analysis.significanceLevel);
    const best = accepted.length > 0
      ? accepted.reduce((prev, curr) => {
          const aicPrev = 2 * prev.numParams * Math.log(filteredDefects.length) + prev.chi2;
          const aicCurr = 2 * curr.numParams * Math.log(filteredDefects.length) + curr.chi2;
          if (prev.fitsData && !curr.fitsData) return prev;
          if (!prev.fitsData && curr.fitsData) return curr;
          return aicCurr < aicPrev ? curr : prev;
        })
      : results.reduce((prev, curr) => {
          const aicPrev = 2 * prev.numParams * Math.log(filteredDefects.length) + prev.chi2;
          const aicCurr = 2 * curr.numParams * Math.log(filteredDefects.length) + curr.chi2;
          if (prev.fitsData && !curr.fitsData) return prev;
          if (!prev.fitsData && curr.fitsData) return curr;
          return aicCurr < aicPrev ? curr : prev;
        }, { chi2: Infinity, fitsData: false, numParams: Infinity });

    log('info', 'Результаты анализа', {
      acceptedDistributions: accepted.map(r => r.name),
      bestDistribution: best.name,
      chiSquareValues: { Poisson: chi2_poisson, Binomial: chi2_binomial, NegativeBinomial: chi2_negBinomial },
      pValues: { Poisson: pValuePoisson, Binomial: pValueBinomial, NegativeBinomial: pValueNegBinomial },
      binCount: bins.length,
      meanCI,
      varianceCI,
      outlierImpact: {
        withOutliers: { mean: meanWithOutliers, variance: varianceWithOutliers, chi2: chi2_poisson, pValue: pValuePoisson },
        withoutOutliers: { mean, variance, chi2: best.chi2, pValue: best.pValue },
      },
    });

    setAnalysis({
      distribution: best.name || '',
      suggestedDistribution,
      parameters: best.params || {},
      empiricalFrequencies: binnedEmpirical,
      theoreticalFrequencies: {
        Poisson: binnedPoisson,
        Binomial: binnedBinomial,
        NegativeBinomial: binnedNegBinomial,
      },
      chiSquareValues: {
        Poisson: chi2_poisson,
        Binomial: chi2_binomial,
        NegativeBinomial: chi2_negBinomial,
        criticalValue: best.critical,
      },
      pValues: { Poisson: pValuePoisson, Binomial: pValueBinomial, NegativeBinomial: pValueNegBinomial },
      degreesOfFreedom: best.df,
      significanceLevel: analysis.significanceLevel,
      hypothesisAccepted: best.chi2 < best.critical && isFinite(best.chi2) && best.pValue > analysis.significanceLevel,
      chiSquareValue: best.chi2,
      pValue: best.pValue,
      binLabels,
      meanCI,
      varianceCI,
      outlierImpact: {
        withOutliers: { mean: meanWithOutliers, variance: varianceWithOutliers, chi2: chi2_poisson, pValue: pValuePoisson },
        withoutOutliers: { mean, variance, chi2: best.chi2, pValue: best.pValue },
      },
    });

    if (!error) setError(null);
    log('info', 'Анализ завершён');
  }, [data, analysis.significanceLevel, includeOutliers, outlierThreshold]);

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
            <FileUploader setData={setData} data={data} analysis={analysis} setAnalysis={setAnalysis} />
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
          <Grid sx={{ width: { xs: '100%', md: '100%' } }}>
            <Paper elevation={4} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 'xl', bgcolor: 'white', '&:hover': { boxShadow: 'xl' }, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'gray.800', fontWeight: 'semibold', mb: 2 }}>
                Гистограмма частот
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeOutliers}
                    onChange={(e) => setIncludeOutliers(e.target.checked)}
                    color="primary"
                  />
                }
                label="Включить выбросы в анализ"
              />
              <TextField
                label="Множитель IQR (порог выбросов)"
                type="number"
                value={outlierThreshold}
                onChange={(e) => setOutlierThreshold(Math.max(0, parseFloat(e.target.value) || 1.5))}
                sx={{ ml: 2, mb: 2 }}
                inputProps={{ step: 0.1, min: 0 }}
              />
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