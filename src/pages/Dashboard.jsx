import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { jStat } from 'jstat';
import { Grid, Paper, Typography, Snackbar, Alert, FormControlLabel, Checkbox, Box, Fab, Button } from '@mui/material';
import { Settings, History } from '@mui/icons-material';

// Components
import DataTable from '../components/DataTable';
import DistributionChart from '../components/DistributionChart';
import ChiSquareVisualization from '../components/ChiSquareVisualization';
import ResultSummary from '../components/ResultSummary';
import FileUploader from '../components/FileUploader';
import AutoSave from '../components/AutoSave';
import LogManager from '../components/LogManager';

// Utils
import { log } from '../utils/Logger';
import { useAutoRestore } from '../hooks/useAutoRestore';

// Constants
const OUTLIER_THRESHOLD_PROBABILITY = 0.001;
const DEFAULT_SIGNIFICANCE_LEVEL = 0.05;
const MIN_EXPECTED_FREQ = 5;
const MIN_BINS = 3;

const Dashboard = () => {
  // State
  const [data, setData] = useState([]);
  const [includeOutliers, setIncludeOutliers] = useState(false);
  const [error, setError] = useState(null);
  const [showLogManager, setShowLogManager] = useState(false);
  const [analysis, setAnalysis] = useState({
    distribution: '',
    parameters: {},
    empiricalFrequencies: [],
    theoreticalFrequencies: { Poisson: [], Binomial: [], NegativeBinomial: [] },
    chiSquareValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0, criticalValue: 0 },
    pValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0 },
    degreesOfFreedom: 0,
    significanceLevel: DEFAULT_SIGNIFICANCE_LEVEL,
    hypothesisAccepted: false,
    binLabels: [],
    meanCI: [],
    varianceCI: [],
  });

  // Автовосстановление данных
  const { hasAutoSave, autoSaveData, restoreAutoSave, dismissAutoSave } = useAutoRestore(setData, setAnalysis);

  // Enhanced logging utility - теперь использует Logger.js
  const logMessage = useCallback((level, message, data = {}) => {
    log(level, message, {
      ...data,
      component: 'Dashboard',
      timestamp: new Date().toISOString(),
      sessionData: {
        dataLength: data?.length || 0,
        includeOutliers,
        significanceLevel: analysis.significanceLevel
      }
    });
  }, [includeOutliers, analysis.significanceLevel]);

  // Validation Functions
  const validateData = useCallback((data) => {
    logMessage('info', 'Начинаем валидацию данных', { recordCount: data.length });
    
    if (data.length === 0) {
      throw new Error('Ошибка: данные отсутствуют. Пожалуйста, загрузите данные.');
    }

    let validCount = 0;
    let invalidCount = 0;

    const isValid = data.every((row, i) => {
      if (typeof row.total !== 'number' || typeof row.defects !== 'number') {
        logMessage('error', `Недопустимый тип данных в строке ${i + 1}`, { 
          total: row.total, 
          defects: row.defects,
          totalType: typeof row.total,
          defectsType: typeof row.defects 
        });
        invalidCount++;
        return false;
      }

      if (row.total < 0 || row.defects < 0) {
        logMessage('error', `Некорректные данные в строке ${i + 1}`, { total: row.total, defects: row.defects });
        invalidCount++;
        return false;
      }

      if (row.defects > row.total) {
        logMessage('error', `Бракованных деталей больше общего количества в строке ${i + 1}`, { total: row.total, defects: row.defects });
        invalidCount++;
        return false;
      }

      if (isNaN(row.total) || isNaN(row.defects)) {
        logMessage('error', `NaN обнаружен в строке ${i + 1}`, { total: row.total, defects: row.defects });
        invalidCount++;
        return false;
      }

      validCount++;
      return true;
    });

    logMessage('info', 'Результат валидации', { 
      totalRecords: data.length,
      validRecords: validCount,
      invalidRecords: invalidCount,
      isValid 
    });

    if (!isValid) {
      throw new Error('Ошибка: обнаружены некорректные данные (отрицательные значения, NaN, defects > total или неверный тип). Проверьте данные.');
    }

    return true;
  }, [logMessage]);

  // Enhanced statistics calculation
  const calculateBasicStatistics = useCallback((defects, totalItems) => {
    logMessage('calc', 'Начинаем расчет базовой статистики', { 
      defectsLength: defects.length,
      totalItems,
      defectsPreview: defects.slice(0, 10) 
    });

    if (!Array.isArray(defects) || defects.length === 0) {
      throw new Error('Пустой массив дефектов или неверный формат');
    }
    if (!defects.every(val => Number.isFinite(val) && val >= 0)) {
      throw new Error('Массив дефектов должен содержать только неотрицательные числа');
    }
    if (!Number.isFinite(totalItems) || totalItems < 0) {
      throw new Error('Общее количество элементов должно быть неотрицательным числом');
    }

    const n = defects.length;
    const sum = defects.reduce((sum, val) => sum + val, 0);
    const mean = sum / n;
    const variance = defects.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(n - 1, 1);
    const stdDev = Math.sqrt(variance);
    const defectRate = totalItems > 0 ? sum / totalItems : 0;

    logMessage('calc', 'Основные статистики рассчитаны', {
      n,
      sum,
      mean,
      variance,
      stdDev,
      defectRate,
      overdispersion: variance / mean
    });

    // Доверительные интервалы
    let meanCI, varianceCI;
    try {
      const seMean = Math.sqrt(variance / n);
      const tCritical = 1.96; // для 95% доверительного интервала
      const chi2Lower = jStat.chisquare.inv(0.025, n - 1);
      const chi2Upper = jStat.chisquare.inv(0.975, n - 1);
      
      meanCI = [mean - tCritical * seMean, mean + tCritical * seMean];
      
      if (Number.isFinite(chi2Lower) && Number.isFinite(chi2Upper) && chi2Lower > 0 && chi2Upper > 0) {
        varianceCI = [(n - 1) * variance / chi2Upper, (n - 1) * variance / chi2Lower];
      } else {
        varianceCI = [NaN, NaN];
      }

      logMessage('calc', 'Доверительные интервалы рассчитаны', {
        seMean,
        tCritical,
        chi2Lower,
        chi2Upper,
        meanCI,
        varianceCI
      });
    } catch (error) {
      logMessage('warning', 'Ошибка при вычислении доверительных интервалов', { error: error.message });
      meanCI = [NaN, NaN];
      varianceCI = [NaN, NaN];
    }

    // Параметры распределений
    const lambda = mean;
    const binomialP = defectRate;
    const avgN = Math.round(totalItems / n);

    logMessage('calc', 'Параметры простых распределений', {
      lambda,
      binomialP,
      avgN
    });

    // Параметры отрицательного биномиального распределения
    let negBinomialR, negBinomialP;
    const hasOverdispersion = variance > mean * 1.1;
    
    logMessage('calc', 'Проверка сверхдисперсии', {
      variance,
      mean,
      ratio: variance / mean,
      hasOverdispersion,
      threshold: mean * 1.1
    });

    if (hasOverdispersion) {
      // Метод моментов: E[X] = r(1-p)/p, Var[X] = r(1-p)/p²
      const r = (mean * mean) / (variance - mean);
      const p = mean / variance;
      
      logMessage('calc', 'Расчет параметров отрицательного биномиального (метод моментов)', {
        formulaUsed: 'r = μ²/(σ²-μ), p = μ/σ²',
        calculatedR: r,
        calculatedP: p,
        isValidR: Number.isFinite(r) && r > 0,
        isValidP: Number.isFinite(p) && p > 0 && p < 1
      });
      
      if (Number.isFinite(r) && r > 0 && Number.isFinite(p) && p > 0 && p < 1) {
        negBinomialR = r;
        negBinomialP = p;
      } else {
        logMessage('warning', 'Некорректные параметры отрицательного биномиального, используем значения по умолчанию', {
          invalidR: r,
          invalidP: p
        });
        negBinomialR = mean > 0 ? mean : 1;
        negBinomialP = 0.5;
      }
    } else {
      logMessage('calc', 'Нет сверхдисперсии, используем стандартные параметры');
      negBinomialR = mean > 0 ? mean : 1;
      negBinomialP = 0.5;
    }

    // Дополнительная валидация
    if (!Number.isFinite(negBinomialP) || negBinomialP <= 0 || negBinomialP >= 1) {
      logMessage('warning', 'Корректировка negBinomialP', { 
        original: negBinomialP, 
        corrected: 0.5 
      });
      negBinomialP = 0.5;
    }
    if (!Number.isFinite(negBinomialR) || negBinomialR <= 0) {
      logMessage('warning', 'Корректировка negBinomialR', { 
        original: negBinomialR, 
        corrected: mean > 0 ? mean : 1 
      });
      negBinomialR = mean > 0 ? mean : 1;
    }

    const finalStats = {
      n,
      mean,
      variance,
      stdDev,
      defectRate,
      meanCI,
      varianceCI,
      lambda,
      binomialP,
      avgN,
      negBinomialR,
      negBinomialP,
      hasFixedParties: true,
      hasOverdispersion
    };

    logMessage('calc', 'Финальные статистики', finalStats);

    return finalStats;
  }, [logMessage]);

  // Enhanced outlier detection
  const calculateOutlierBound = useCallback((distType, params) => {
    logMessage('calc', `Расчет границы выбросов для ${distType}`, { params });
    
    let upperBound = 0;
    let cumulativeProb = 0;
    let iterations = 0;

    switch (distType) {
      case 'Poisson':
        const { lambda } = params;
        if (!lambda || lambda <= 0) {
          logMessage('warning', 'Некорректный lambda для Пуассона', { lambda });
          return Infinity;
        }
        
        for (let k = 0; cumulativeProb < 1 - OUTLIER_THRESHOLD_PROBABILITY; k++) {
          const prob = jStat.poisson.pdf(k, lambda);
          cumulativeProb += prob;
          upperBound = k;
          iterations++;
          
          if (k <= 5 || k % 10 === 0) {
            logMessage('debug', `Пуассон k=${k}`, { prob, cumulativeProb });
          }
          
          if (k > 100) break;
        }
        break;

      case 'Binomial':
        const { n, p } = params;
        if (!n || !p || n <= 0 || p <= 0 || p >= 1) {
          logMessage('warning', 'Некорректные параметры для биномиального', { n, p });
          return Infinity;
        }
        
        for (let k = 0; k <= n && cumulativeProb < 1 - OUTLIER_THRESHOLD_PROBABILITY; k++) {
          const prob = jStat.binomial.pdf(k, n, p);
          cumulativeProb += prob;
          upperBound = k;
          iterations++;
          
          if (k <= 5 || k % 5 === 0) {
            logMessage('debug', `Биномиальное k=${k}`, { prob, cumulativeProb });
          }
        }
        break;

      case 'NegativeBinomial':
        const { r, negP } = params;
        if (!r || !negP || r <= 0 || negP <= 0 || negP >= 1) {
          logMessage('warning', 'Некорректные параметры для отрицательного биномиального', { r, negP });
          return Infinity;
        }
        
        for (let k = 0; cumulativeProb < 1 - OUTLIER_THRESHOLD_PROBABILITY; k++) {
          const prob = jStat.negbin.pdf(k, r, 1 - negP);
          cumulativeProb += prob;
          upperBound = k;
          iterations++;
          
          if (k <= 5 || k % 10 === 0) {
            logMessage('debug', `Отрицательное биномиальное k=${k}`, { prob, cumulativeProb });
          }
          
          if (k > 100) break;
        }
        break;

      default:
        logMessage('warning', 'Неизвестный тип распределения', { distType });
        upperBound = Infinity;
    }

    logMessage('calc', `Граница выбросов для ${distType} рассчитана`, {
      upperBound,
      finalCumulativeProb: cumulativeProb,
      iterations,
      threshold: 1 - OUTLIER_THRESHOLD_PROBABILITY
    });

    return upperBound;
  }, [logMessage]);

  const filterOutliers = useCallback((defects, distType, params) => {
    logMessage('calc', `Начинаем фильтрацию выбросов для ${distType}`, {
      originalCount: defects.length,
      params
    });
    
    const upperBound = calculateOutlierBound(distType, params);
    let outlierCount = 0;
    
    const filtered = defects.filter((d, i) => {
      if (d <= upperBound) {
        return true;
      }
      outlierCount++;
      logMessage('warning', 'Исключен выброс', { 
        index: i, 
        defect: d, 
        upperBound, 
        distType 
      });
      return false;
    });

    logMessage('calc', `Фильтрация выбросов завершена для ${distType}`, {
      originalCount: defects.length,
      filteredCount: filtered.length,
      outlierCount,
      upperBound
    });

    return filtered;
  }, [calculateOutlierBound, logMessage]);

  // Enhanced theoretical frequencies calculation
  const calculateTheoreticalFrequencies = useCallback((filteredDefects, stats) => {
    const filteredDefectsLength = filteredDefects.length;
    const maxDefects = Math.max(...filteredDefects);
    const { lambda, binomialP, avgN, negBinomialR, negBinomialP } = stats;

    logMessage('calc', 'Начинаем расчет теоретических частот', {
      filteredDefectsLength,
      maxDefects,
      lambda,
      binomialP,
      avgN,
      negBinomialR,
      negBinomialP
    });

    // Пуассон
    const poissonFrequencies = Array(maxDefects + 1).fill(0).map((_, k) => {
      if (lambda <= 0) return 0;
      const prob = jStat.poisson.pdf(k, lambda);
      const freq = isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * filteredDefectsLength;
      
      if (k <= 5) {
        logMessage('debug', `Пуассон k=${k}`, { prob, freq });
      }
      
      return freq;
    });

    const poissonSum = poissonFrequencies.reduce((sum, freq) => sum + freq, 0);
    logMessage('calc', 'Частоты Пуассона рассчитаны', {
      totalSum: poissonSum,
      expectedSum: filteredDefectsLength,
      difference: Math.abs(poissonSum - filteredDefectsLength)
    });

    // Биномиальное
    const n = Math.round(avgN);
    const binomialFrequencies = Array(maxDefects + 1).fill(0).map((_, k) => {
      if (k > n || n <= 0 || binomialP <= 0 || binomialP >= 1) return 0;
      
      try {
        const logCoef = jStat.gammaln(n + 1) - jStat.gammaln(k + 1) - jStat.gammaln(n - k + 1);
        const logProb = logCoef + k * Math.log(binomialP) + (n - k) * Math.log(1 - binomialP);
        const prob = Math.exp(logProb);
        const freq = isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * filteredDefectsLength;
        
        if (k <= 5) {
          logMessage('debug', `Биномиальное k=${k}`, { logCoef, logProb, prob, freq });
        }
        
        return freq;
      } catch (error) {
        logMessage('warning', `Ошибка расчета биномиального для k=${k}`, { 
          k, n, p: binomialP, error: error.message 
        });
        return 0;
      }
    });

    const binomialSum = binomialFrequencies.reduce((sum, freq) => sum + freq, 0);
    logMessage('calc', 'Частоты биномиального рассчитаны', {
      n,
      totalSum: binomialSum,
      expectedSum: filteredDefectsLength,
      difference: Math.abs(binomialSum - filteredDefectsLength)
    });

    // Отрицательное биномиальное
    const negBinomialFrequencies = Array(maxDefects + 1).fill(0).map((_, k) => {
      if (negBinomialP <= 0 || negBinomialP >= 1 || negBinomialR <= 0) return 0;
      
      try {
        // jStat использует параметризацию с (1-p)
        const prob = jStat.negbin.pdf(k, negBinomialR, 1 - negBinomialP);
        const freq = isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * filteredDefectsLength;
        const result = freq > filteredDefectsLength * 2 ? 0 : freq;
        
        if (k <= 5) {
          logMessage('debug', `Отрицательное биномиальное k=${k}`, { 
            r: negBinomialR, 
            p: negBinomialP, 
            jStatP: 1 - negBinomialP,
            prob, 
            freq,
            result 
          });
        }
        
        return result;
      } catch (error) {
        logMessage('warning', `Ошибка расчета отрицательного биномиального для k=${k}`, { 
          k, r: negBinomialR, p: negBinomialP, error: error.message 
        });
        return 0;
      }
    });

    const negBinomialSum = negBinomialFrequencies.reduce((sum, freq) => sum + freq, 0);
    logMessage('calc', 'Частоты отрицательного биномиального рассчитаны', {
      totalSum: negBinomialSum,
      expectedSum: filteredDefectsLength,
      difference: Math.abs(negBinomialSum - filteredDefectsLength)
    });

    return { poissonFrequencies, binomialFrequencies, negBinomialFrequencies };
  }, [logMessage]);

  // Enhanced optimal binning
  const createOptimalBins = useCallback((empiricalFreqs, poissonFreqs, binomialFreqs, negBinomialFreqs) => {
    const maxIndex = empiricalFreqs.length - 1;
    logMessage('calc', 'Создание оптимальных интервалов', { 
      dataLength: maxIndex + 1,
      minExpectedFreq: MIN_EXPECTED_FREQ,
      minBins: MIN_BINS
    });
    
    const bins = [];
    let currentStart = 0;
    
    while (currentStart <= maxIndex) {
      let currentEnd = currentStart;
      let sumEmpirical = empiricalFreqs[currentStart] || 0;
      let sumPoisson = poissonFreqs[currentStart] || 0;
      let sumBinomial = binomialFreqs[currentStart] || 0;
      let sumNegBinomial = negBinomialFreqs[currentStart] || 0;
      
      logMessage('debug', `Начинаем интервал с позиции ${currentStart}`, {
        startEmpirical: sumEmpirical,
        startPoisson: sumPoisson,
        startBinomial: sumBinomial,
        startNegBinomial: sumNegBinomial
      });
      
      // Объединяем интервалы пока не достигнем минимальной ожидаемой частоты
      while (currentEnd < maxIndex) {
        const nextEmpirical = empiricalFreqs[currentEnd + 1] || 0;
        const nextPoisson = poissonFreqs[currentEnd + 1] || 0;
        const nextBinomial = binomialFreqs[currentEnd + 1] || 0;
        const nextNegBinomial = negBinomialFreqs[currentEnd + 1] || 0;
        
        // Проверяем, достаточны ли текущие частоты
        const sufficientPoisson = sumPoisson >= MIN_EXPECTED_FREQ;
        const sufficientBinomial = sumBinomial >= MIN_EXPECTED_FREQ;
        const sufficientNegBinomial = sumNegBinomial >= MIN_EXPECTED_FREQ;
        
        // Если все распределения имеют достаточные частоты, завершаем интервал
        if (sufficientPoisson && sufficientBinomial && sufficientNegBinomial) {
          break;
        }
        
        // Иначе расширяем интервал
        currentEnd++;
        sumEmpirical += nextEmpirical;
        sumPoisson += nextPoisson;
        sumBinomial += nextBinomial;
        sumNegBinomial += nextNegBinomial;
      }
      
      bins.push([currentStart, currentEnd]);
      logMessage('debug', `Интервал создан: [${currentStart}, ${currentEnd}]`, {
        empirical: sumEmpirical,
        poisson: sumPoisson.toFixed(2),
        binomial: sumBinomial.toFixed(2),
        negBinomial: sumNegBinomial.toFixed(2)
      });
      
      currentStart = currentEnd + 1;
    }
    
    // Если интервалов критически мало, делаем принудительное разбиение
    if (bins.length < MIN_BINS) {
      logMessage('warning', 'Критически мало интервалов, выполняем принудительное разбиение', {
        currentBins: bins.length,
        minRequired: MIN_BINS
      });
      
      const forcedBins = [];
      const step = Math.ceil((maxIndex + 1) / MIN_BINS);
      
      for (let i = 0; i <= maxIndex; i += step) {
        const end = Math.min(i + step - 1, maxIndex);
        forcedBins.push([i, end]);
      }
      
      logMessage('calc', 'Принудительные интервалы созданы', { 
        forcedBins,
        step
      });
      
      return createBinnedFrequencies(forcedBins, empiricalFreqs, poissonFreqs, binomialFreqs, negBinomialFreqs);
    }
    
    logMessage('calc', `Создано ${bins.length} оптимальных интервалов`, { bins });
    
    return createBinnedFrequencies(bins, empiricalFreqs, poissonFreqs, binomialFreqs, negBinomialFreqs);
  }, [logMessage]);

  // Create binned frequencies
  const createBinnedFrequencies = useCallback((bins, empiricalFreqs, poissonFreqs, binomialFreqs, negBinomialFreqs) => {
    logMessage('calc', 'Создание частот по интервалам');
    
    const binnedEmpirical = bins.map(([start, end], binIndex) => {
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += empiricalFreqs[i] || 0;
      }
      logMessage('debug', `Интервал ${binIndex} [${start}-${end}] эмпирическая частота: ${sum}`);
      return sum;
    });
    
    const binnedPoisson = bins.map(([start, end], binIndex) => {
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += poissonFreqs[i] || 0;
      }
      logMessage('debug', `Интервал ${binIndex} [${start}-${end}] Пуассон: ${sum.toFixed(3)}`);
      return sum;
    });
    
    const binnedBinomial = bins.map(([start, end], binIndex) => {
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += binomialFreqs[i] || 0;
      }
      logMessage('debug', `Интервал ${binIndex} [${start}-${end}] биномиальное: ${sum.toFixed(3)}`);
      return sum;
    });
    
    const binnedNegBinomial = bins.map(([start, end], binIndex) => {
      let sum = 0;
      for (let i = start; i <= end; i++) {
        sum += negBinomialFreqs[i] || 0;
      }
      logMessage('debug', `Интервал ${binIndex} [${start}-${end}] отрицательное биномиальное: ${sum.toFixed(3)}`);
      return sum;
    });
    
    logMessage('calc', 'Частоты по интервалам созданы', {
      binCount: bins.length,
      empiricalSum: binnedEmpirical.reduce((a, b) => a + b, 0),
      poissonSum: binnedPoisson.reduce((a, b) => a + b, 0).toFixed(2),
      binomialSum: binnedBinomial.reduce((a, b) => a + b, 0).toFixed(2),
      negBinomialSum: binnedNegBinomial.reduce((a, b) => a + b, 0).toFixed(2)
    });
    
    return { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial };
  }, [logMessage]);

  // Enhanced Chi-square test
  const computeChiSquare = useCallback((observed, expected, distName, numParams) => {
    logMessage('calc', `Начинаем χ² расчет для ${distName}`, { 
      observedLength: observed.length,
      expectedLength: expected.length,
      numParams
    });
    
    if (observed.length !== expected.length) {
      logMessage('error', 'Несоответствие размеров массивов', { 
        observedLength: observed.length,
        expectedLength: expected.length 
      });
      return { chi2: Infinity, validBins: 0, df: 0 };
    }

    let chi2 = 0;
    let validBins = 0;
    const excludedBins = [];
    const contributions = [];

    for (let i = 0; i < observed.length; i++) {
      const o = observed[i];
      const e = expected[i];
      
      if (Number.isFinite(e) && e >= MIN_EXPECTED_FREQ && Number.isFinite(o) && o >= 0) {
        const contribution = Math.pow(o - e, 2) / e;
        chi2 += contribution;
        validBins++;
        contributions.push({
          bin: i,
          observed: o,
          expected: e,
          contribution
        });
        logMessage('debug', `${distName} интервал ${i} включён в расчет`, { 
          observed: o, 
          expected: e.toFixed(3), 
          contribution: contribution.toFixed(3) 
        });
      } else {
        excludedBins.push({ bin: i, observed: o, expected: e, reason: getExclusionReason(o, e) });
        logMessage('debug', `${distName} интервал ${i} исключён`, { 
          observed: o, 
          expected: e, 
          reason: getExclusionReason(o, e) 
        });
      }
    }

    function getExclusionReason(o, e) {
      if (!Number.isFinite(e)) return 'Ожидаемое значение не является конечным числом';
      if (e < MIN_EXPECTED_FREQ) return `Ожидаемое значение меньше ${MIN_EXPECTED_FREQ}`;
      if (!Number.isFinite(o)) return 'Наблюдаемое значение не является конечным числом';
      if (o < 0) return 'Наблюдаемое значение отрицательное';
      return 'Неизвестная причина';
    }

    const minValidBins = numParams + 2;
    if (validBins < minValidBins) {
      logMessage('warning', `Недостаточно валидных интервалов для ${distName}`, { 
        validBins, 
        minRequired: minValidBins,
        excludedBins 
      });
      return { chi2: Infinity, validBins: 0, df: 0 };
    }
    
    const df = Math.max(validBins - 1 - numParams, 1);
    
    logMessage('calc', `χ² расчет завершен для ${distName}`, { 
      chi2: chi2.toFixed(3), 
      validBins, 
      df, 
      excludedCount: excludedBins.length,
      topContributions: contributions
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3)
        .map(c => ({ bin: c.bin, contribution: c.contribution.toFixed(3) }))
    });
    
    return { 
      chi2: Number.isFinite(chi2) && chi2 >= 0 ? chi2 : Infinity, 
      validBins, 
      df 
    };
  }, [logMessage]);

  // Enhanced distribution analysis
  const analyzeDistributions = useCallback((binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial, stats, significanceLevel) => {
    const { lambda, binomialP, avgN, negBinomialR, negBinomialP } = stats;

    logMessage('calc', 'Начинаем анализ распределений', {
      significanceLevel,
      binCount: binnedEmpirical.length,
      parameters: { lambda, binomialP, avgN, negBinomialR, negBinomialP }
    });

    // Расчет χ² для каждого распределения
    const poissonResult = computeChiSquare(binnedEmpirical, binnedPoisson, 'Poisson', 1);
    const binomialResult = computeChiSquare(binnedEmpirical, binnedBinomial, 'Binomial', 2);
    const negBinomialResult = computeChiSquare(binnedEmpirical, binnedNegBinomial, 'NegativeBinomial', 2);

    const results = [];

    // Пуассон
    if (poissonResult.df > 0 && Number.isFinite(poissonResult.chi2)) {
      const criticalValue = jStat.chisquare.inv(1 - significanceLevel, poissonResult.df);
      const pValue = Math.max(0, Math.min(1, 1 - jStat.chisquare.cdf(poissonResult.chi2, poissonResult.df)));
      const isAccepted = pValue >= significanceLevel;
      
      logMessage('calc', 'Пуассон - результаты', {
        chi2: poissonResult.chi2.toFixed(3),
        df: poissonResult.df,
        criticalValue: criticalValue.toFixed(3),
        pValue: pValue.toFixed(6),
        isAccepted,
        lambda
      });
      
      results.push({
        name: 'Poisson',
        chi2: poissonResult.chi2,
        df: poissonResult.df,
        validBins: poissonResult.validBins,
        critical: criticalValue,
        pValue,
        numParams: 1,
        params: { lambda },
        isAccepted
      });
    }

    // Биномиальное
    if (binomialResult.df > 0 && Number.isFinite(binomialResult.chi2)) {
      const criticalValue = jStat.chisquare.inv(1 - significanceLevel, binomialResult.df);
      const pValue = Math.max(0, Math.min(1, 1 - jStat.chisquare.cdf(binomialResult.chi2, binomialResult.df)));
      const isAccepted = pValue >= significanceLevel;
      
      logMessage('calc', 'Биномиальное - результаты', {
        chi2: binomialResult.chi2.toFixed(3),
        df: binomialResult.df,
        criticalValue: criticalValue.toFixed(3),
        pValue: pValue.toFixed(6),
        isAccepted,
        n: avgN,
        p: binomialP
      });
      
      results.push({
        name: 'Binomial',
        chi2: binomialResult.chi2,
        df: binomialResult.df,
        validBins: binomialResult.validBins,
        critical: criticalValue,
        pValue,
        numParams: 2,
        params: { n: avgN, p: binomialP },
        isAccepted
      });
    }

    // Отрицательное биномиальное
    if (negBinomialResult.df > 0 && Number.isFinite(negBinomialResult.chi2)) {
      const criticalValue = jStat.chisquare.inv(1 - significanceLevel, negBinomialResult.df);
      const pValue = Math.max(0, Math.min(1, 1 - jStat.chisquare.cdf(negBinomialResult.chi2, negBinomialResult.df)));
      const isAccepted = pValue >= significanceLevel;
      
      logMessage('calc', 'Отрицательное биномиальное - результаты', {
        chi2: negBinomialResult.chi2.toFixed(3),
        df: negBinomialResult.df,
        criticalValue: criticalValue.toFixed(3),
        pValue: pValue.toFixed(6),
        isAccepted,
        r: negBinomialR,
        p: negBinomialP
      });
      
      results.push({
        name: 'NegativeBinomial',
        chi2: negBinomialResult.chi2,
        df: negBinomialResult.df,
        validBins: negBinomialResult.validBins,
        critical: criticalValue,
        pValue,
        numParams: 2,
        params: { r: negBinomialR, p: negBinomialP },
        isAccepted
      });
    }

    // Определяем лучшее распределение
    const accepted = results.filter(r => r.isAccepted);
    const best = results.length > 0 ? 
      results.reduce((prev, curr) => 
        (curr.isAccepted && curr.pValue > prev.pValue) || 
        (!prev.isAccepted && curr.chi2 < prev.chi2) ? curr : prev
      ) : null;

    const analysisResult = {
      results,
      accepted,
      best,
      chiSquareValues: {
        Poisson: results.find(r => r.name === 'Poisson')?.chi2 || 0,
        Binomial: results.find(r => r.name === 'Binomial')?.chi2 || 0,
        NegativeBinomial: results.find(r => r.name === 'NegativeBinomial')?.chi2 || 0,
        criticalValue: best?.critical || 0,
      },
      pValues: {
        Poisson: results.find(r => r.name === 'Poisson')?.pValue || 0,
        Binomial: results.find(r => r.name === 'Binomial')?.pValue || 0,
        NegativeBinomial: results.find(r => r.name === 'NegativeBinomial')?.pValue || 0,
      },
    };

    logMessage('calc', 'Анализ распределений завершен', {
      bestDistribution: best?.name || 'none',
      bestChi2: best?.chi2?.toFixed(3) || 'N/A',
      bestPValue: best?.pValue?.toFixed(6) || 'N/A',
      acceptedCount: accepted.length,
      allResults: results.map(r => ({
        name: r.name,
        chi2: r.chi2.toFixed(3),
        pValue: r.pValue.toFixed(6),
        isAccepted: r.isAccepted
      }))
    });

    return analysisResult;
  }, [computeChiSquare, logMessage]);

  // Main analysis effect with enhanced logging
  useEffect(() => {
    if (data.length === 0) return;

    logMessage('info', '🔥 ЗАПУСК ПОЛНОГО АНАЛИЗА', { 
      dataLength: data.length,
      includeOutliers,
      significanceLevel: analysis.significanceLevel 
    });

    try {
      validateData(data);

      const defects = data.map((row, i) => {
        const defect = Number(row.defects) || 0;
        if (isNaN(defect) || defect < 0) {
          logMessage('error', `Некорректное значение defects в строке ${i + 1}`, { defect: row.defects });
          return 0;
        }
        return defect;
      });

      const totalItems = data.reduce((sum, row) => sum + row.total, 0);
      
      logMessage('calc', 'Извлечены дефекты из данных', {
        defectsCount: defects.length,
        totalItems,
        defectsPreview: defects.slice(0, 10),
        defectsSum: defects.reduce((a, b) => a + b, 0)
      });

      const stats = calculateBasicStatistics(defects, totalItems);

      const filteredDefects = includeOutliers ? defects : filterOutliers(defects, 'Binomial', {
        lambda: stats.lambda,
        n: stats.avgN,
        p: stats.binomialP,
        r: stats.negBinomialR,
        negP: stats.negBinomialP,
      });

      if (filteredDefects.length === 0) {
        throw new Error('Ошибка: после фильтрации выбросов данные отсутствуют.');
      }

      logMessage('calc', 'Данные после фильтрации', {
        originalLength: defects.length,
        filteredLength: filteredDefects.length,
        removedCount: defects.length - filteredDefects.length
      });

      const maxDefects = Math.max(...filteredDefects);
      const empiricalFrequencies = Array(maxDefects + 1).fill(0);
      filteredDefects.forEach(d => empiricalFrequencies[d]++);

      logMessage('calc', 'Эмпирические частоты созданы', {
        maxDefects,
        empiricalFrequencies: empiricalFrequencies.slice(0, Math.min(10, empiricalFrequencies.length)),
        totalFreq: empiricalFrequencies.reduce((a, b) => a + b, 0)
      });

      const { poissonFrequencies, binomialFrequencies, negBinomialFrequencies } = 
        calculateTheoreticalFrequencies(filteredDefects, stats);

      const { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial } = 
        createOptimalBins(empiricalFrequencies, poissonFrequencies, binomialFrequencies, negBinomialFrequencies);

      const binLabels = bins.map(([start, end]) => start === end ? `${start}` : `${start}-${end}`);

      logMessage('calc', 'Оптимальные интервалы созданы', {
        binCount: bins.length,
        binLabels: binLabels.slice(0, 10),
        empirical: binnedEmpirical.reduce((a, b) => a + b, 0),
        poisson: binnedPoisson.reduce((a, b) => a + b, 0).toFixed(2),
        binomial: binnedBinomial.reduce((a, b) => a + b, 0).toFixed(2),
        negBinomial: binnedNegBinomial.reduce((a, b) => a + b, 0).toFixed(2)
      });

      const analysisResults = analyzeDistributions(
        binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial, 
        stats, analysis.significanceLevel
      );

      const finalAnalysis = {
        ...analysis,
        distribution: analysisResults.best?.name || '',
        parameters: analysisResults.best?.params || {},
        empiricalFrequencies: binnedEmpirical,
        theoreticalFrequencies: {
          Poisson: binnedPoisson,
          Binomial: binnedBinomial,
          NegativeBinomial: binnedNegBinomial,
        },
        chiSquareValues: analysisResults.chiSquareValues,
        pValues: analysisResults.pValues,
        degreesOfFreedom: analysisResults.best?.df || 0,
        hypothesisAccepted: analysisResults.accepted.length > 0,
        binLabels,
        meanCI: stats.meanCI,
        varianceCI: stats.varianceCI,
      };

      setAnalysis(finalAnalysis);

      // ДОБАВИТЬ: Сохранение в историю ПОСЛЕ завершения анализа
      try {
        const testEntry = {
          id: Date.now() + Math.random(),
          timestamp: new Date().toISOString(),
          data: data,
          analysis: finalAnalysis, // Сохраняем финальный анализ с результатами
          source: 'analysis_completed',
          dataStats: {
            recordCount: data.length,
            totalItems: data.reduce((sum, row) => sum + row.total, 0),
            totalDefects: data.reduce((sum, row) => sum + row.defects, 0),
            bestDistribution: finalAnalysis.distribution,
            hypothesisAccepted: finalAnalysis.hypothesisAccepted
          }
        };

        const existingHistory = JSON.parse(localStorage.getItem('testHistory') || '[]');
        
        // Удаляем предыдущую запись для тех же данных (если есть)
        const filteredHistory = existingHistory.filter(entry => 
          entry.source !== 'analysis_completed' || 
          entry.dataStats?.recordCount !== data.length ||
          Math.abs(new Date(entry.timestamp).getTime() - Date.now()) > 5000 // Старше 5 секунд
        );
        
        const updatedHistory = [...filteredHistory, testEntry];
        
        // Ограничиваем историю до 100 записей
        if (updatedHistory.length > 100) {
          updatedHistory.splice(0, updatedHistory.length - 100);
        }
        
        localStorage.setItem('testHistory', JSON.stringify(updatedHistory));
        
        logMessage('info', 'Результаты анализа сохранены в историю', {
          historyId: testEntry.id,
          bestDistribution: finalAnalysis.distribution,
          hypothesisAccepted: finalAnalysis.hypothesisAccepted,
          totalHistoryItems: updatedHistory.length
        });
      } catch (historyError) {
        logMessage('error', 'Ошибка сохранения в историю', { error: historyError.message });
      }

      if (error) setError(null);
      
      logMessage('info', '✅ АНАЛИЗ ЗАВЕРШЁН УСПЕШНО', {
        bestDistribution: analysisResults.best?.name || 'Не определено',
        bestChi2: analysisResults.best?.chi2?.toFixed(3) || 'N/A',
        bestPValue: analysisResults.best?.pValue?.toFixed(6) || 'N/A',
        hypothesisAccepted: analysisResults.accepted.length > 0,
        finalResults: analysisResults.results.map(r => ({
          name: r.name,
          chi2: r.chi2.toFixed(3),
          pValue: r.pValue.toFixed(6),
          accepted: r.isAccepted
        }))
      });

    } catch (err) {
      logMessage('error', '❌ ОШИБКА В АНАЛИЗЕ', { error: err.message, stack: err.stack });
      setError(err.message);
    }
  }, [data, analysis.significanceLevel, includeOutliers, logMessage, validateData, calculateBasicStatistics, filterOutliers, calculateTheoreticalFrequencies, createOptimalBins, analyzeDistributions, error]);

  // Event handlers
  const handleCloseSnackbar = useCallback(() => {
    setError(null);
  }, []);

  const handleOutliersToggle = useCallback((event) => {
    logMessage('info', 'Переключение обработки выбросов', { 
      newValue: event.target.checked,
      previousValue: includeOutliers 
    });
    setIncludeOutliers(event.target.checked);
  }, [includeOutliers, logMessage]);

  const handleLogManagerToggle = useCallback(() => {
    logMessage('info', 'Открытие/закрытие менеджера логов', { 
      currentState: showLogManager 
    });
    setShowLogManager(prev => !prev);
  }, [showLogManager, logMessage]);

  // Memoized components data
  const memoizedChartData = useMemo(() => {
    if (!data.length || !analysis.empiricalFrequencies?.length) return [];
    
    const chartData = data.map(row => ({
      defects: row.defects,
      total: row.total
    }));
    
    logMessage('debug', 'Chart data memoized', { 
      dataLength: chartData.length,
      sampleData: chartData.slice(0, 5) 
    });
    
    return chartData;
  }, [data, analysis.empiricalFrequencies, logMessage]);

  // Обработка уведомления об автовосстановлении
  useEffect(() => {
    if (hasAutoSave) {
      logMessage('info', 'Обнаружено автосохранение', {
        saveTimestamp: autoSaveData?.timestamp,
        hasData: !!autoSaveData?.data?.length,
        hasAnalysis: !!autoSaveData?.analysis?.distribution
      });
    }
  }, [hasAutoSave, autoSaveData, logMessage]);

return (
  <Box sx={{ 
    minHeight: '100vh', 
    bgcolor: 'gray.50', 
    display: 'flex', 
    flexDirection: 'column' 
  }}>
    {/* Автосохранение */}
    <AutoSave 
      data={data} 
      analysis={analysis} 
      enabled={true} 
      intervalMs={30000} 
    />

    {/* FAB для управления логами */}
    <Fab
      color="secondary"
      aria-label="logs"
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000
      }}
      onClick={handleLogManagerToggle}
    >
      <Settings />
    </Fab>

    {/* Менеджер логов */}
    <LogManager 
      open={showLogManager} 
      onClose={() => setShowLogManager(false)} 
    />

    {/* Уведомление об автовосстановлении */}
    {hasAutoSave && (
      <Snackbar
        open={hasAutoSave}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ zIndex: 2000 }}
      >
        <Alert 
          severity="info" 
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => {
                  restoreAutoSave();
                  logMessage('info', 'Автосохранение восстановлено пользователем');
                }}
              >
                Восстановить
              </Button>
              <Button 
                color="inherit" 
                size="small" 
                onClick={() => {
                  dismissAutoSave();
                  logMessage('info', 'Автосохранение отклонено пользователем');
                }}
              >
                Отклонить
              </Button>
            </Box>
          }
        >
          Найдено автосохранение от {autoSaveData?.timestamp ? 
            new Date(autoSaveData.timestamp).toLocaleString('ru-RU') : 'неизвестного времени'}
        </Alert>
      </Snackbar>
    )}

    <Grid container spacing={3} sx={{ 
      maxWidth: '1200px', 
      mx: 'auto', 
      p: 3, 
      flex: 1 
    }}>
      {/* Header */}
      <Grid size={12}>
        <Paper elevation={4} sx={{ 
          p: 3, 
          borderRadius: 2, 
          bgcolor: 'white',
          borderLeft: '4px solid #1976d2'
        }}>
          <Typography variant="h4" sx={{ 
            color: 'gray.800', 
            fontWeight: 'bold', 
            mb: 1 
          }}>
            Анализ дефектности продукции
          </Typography>
          <Typography variant="body1" sx={{ color: 'gray.600' }}>
            Статистический анализ и определение закона распределения дефектов
          </Typography>
        </Paper>
      </Grid>

      {/* File Upload and Data Table */}
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper elevation={4} sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderRadius: 2, 
          bgcolor: 'white', 
          '&:hover': { boxShadow: 6 }, 
          height: '100%' 
        }}>
          <Typography variant="h6" sx={{ 
            color: 'gray.800', 
            fontWeight: 'semibold', 
            mb: 2, 
            textAlign: 'center' 
          }}>
            Загрузка данных
          </Typography>
          <FileUploader 
            setData={setData} 
            data={data} 
            analysis={analysis} 
            setAnalysis={setAnalysis} 
          />
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Paper elevation={4} sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderRadius: 2, 
          bgcolor: 'white', 
          '&:hover': { boxShadow: 6 }, 
          height: '100%' 
        }}>
          <Typography variant="h6" sx={{ 
            color: 'gray.800', 
            fontWeight: 'semibold', 
            mb: 2 
          }}>
            Данные о партиях
          </Typography>
          <DataTable data={data} setData={setData} />
        </Paper>
      </Grid>

      {/* Chart and Analysis */}
      <Grid size={12}>
        <Paper elevation={4} sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderRadius: 2, 
          bgcolor: 'white', 
          '&:hover': { boxShadow: 6 }, 
          height: '100%' 
        }}>
          <Typography variant="h6" sx={{ 
            color: 'gray.800', 
            fontWeight: 'semibold', 
            mb: 2 
          }}>
            Гистограмма частот
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeOutliers}
                onChange={handleOutliersToggle}
                color="primary"
              />
            }
            label="Включить выбросы в анализ"
          />
          <DistributionChart data={memoizedChartData} analysis={analysis} />
        </Paper>
      </Grid>

      {/* Chi-Square Analysis */}
      <Grid size={12}>
        <Paper elevation={4} sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderRadius: 2, 
          bgcolor: 'white', 
          '&:hover': { boxShadow: 6 }, 
          height: '100%' 
        }}>
          <Typography variant="h6" sx={{ 
            color: 'gray.800', 
            fontWeight: 'semibold', 
            mb: 2 
          }}>
            Анализ хи-квадрат
          </Typography>
          <ChiSquareVisualization analysis={analysis} />
        </Paper>
      </Grid>

      {/* Results Summary */}
      <Grid size={12}>
        <Paper elevation={4} sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderRadius: 2, 
          bgcolor: 'white', 
          '&:hover': { boxShadow: 6 }, 
          width: '100%' 
        }}>
          <Typography variant="h6" sx={{ 
            color: 'gray.800', 
            fontWeight: 'semibold', 
            mb: 2 
          }}>
            Результаты анализа
          </Typography>
          <ResultSummary 
            analysis={analysis} 
            data={data} 
            setAnalysis={setAnalysis} 
            setData={setData} 
            significanceLevel={analysis.significanceLevel} 
          />
        </Paper>
      </Grid>
    </Grid>

      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      {/* Footer */}
      <Box component="footer" sx={{ 
        bgcolor: 'gray.800', 
        color: 'white', 
        py: 2, 
        mt: 'auto' 
      }}>
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          © {new Date().getFullYear()} DefectAnalyzer. ЯГТУ.
        </Typography>
      </Box>
    </Box>
  );
};

export default Dashboard;
