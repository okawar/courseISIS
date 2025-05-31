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
        const prob = jStat.negbin.pdf(k, negBinomialR, negBinomialP);
        const freq = isNaN(prob) || prob < 0 || !isFinite(prob) ? 0 : prob * filteredDefectsLength;
        const result = freq > filteredDefectsLength * 2 ? 0 : freq;
        
        if (k <= 5) {
          logMessage('debug', `Отрицательное биномиальное k=${k}`, { 
            r: negBinomialR, 
            p: negBinomialP, 
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

  // Вспомогательные функции для анализа
  const getDistributionName = useCallback((name) => {
    const names = {
      'Poisson': 'Пуассон',
      'Binomial': 'Биномиальное',
      'NegativeBinomial': 'Отрицательное биномиальное'
    };
    return names[name] || name;
  }, []);

  const getDistributionParams = useCallback((name, stats) => {
    switch (name) {
      case 'Poisson':
        return { lambda: stats.lambda };
      case 'Binomial':
        return { n: stats.avgN, p: stats.binomialP };
      case 'NegativeBinomial':
        return { r: stats.negBinomialR, p: stats.negBinomialP };
      default:
        return {};
    }
  }, []);

  // В функции computeChiSquare, строка ~683
  const computeChiSquare = useCallback((observed, expected, distName, numParams) => {
    let chi2 = 0;
    let validBins = 0;
    const contributions = [];
    const excludedBins = [];

    for (let i = 0; i < observed.length; i++) {
      const obs = observed[i];
      const exp = expected[i];
      
      if (exp < MIN_EXPECTED_FREQ) {
        excludedBins.push({ 
          index: i, observed: obs, expected: exp, 
          reason: 'Ожидаемое значение меньше 5' 
        });
        continue;
      }

      const contribution = Math.pow(obs - exp, 2) / exp;
      chi2 += contribution;
      validBins++;
      contributions.push({ index: i, contribution, observed: obs, expected: exp });
    }

    // ИСПРАВЛЕНО: правильное определение количества параметров
    let finalNumParams;
    if (typeof numParams === 'number' && numParams > 0) {
      finalNumParams = numParams;
    } else {
      // ИСПРАВЛЕНО: fallback с правильными значениями
      if (distName === 'Poisson') {
        finalNumParams = 1; // λ - 1 параметр
      } else if (distName === 'Binomial') {
        finalNumParams = 2; // n, p - 2 параметра  
      } else if (distName === 'NegativeBinomial') {
        finalNumParams = 2; // ИСПРАВЛЕНО: r, p - тоже 2 параметра!
      } else {
        finalNumParams = 1; // По умолчанию
      }
      
      logMessage('warning', `numParams не передан для ${distName}, используем fallback: ${finalNumParams}`, {
        distName,
        fallbackParams: finalNumParams
      });
    }

    const degreesOfFreedom = Math.max(1, validBins - 1 - finalNumParams);
    
    logMessage('calc', `χ² расчет завершен для ${distName}`, {
      chi2: chi2.toFixed(3),
      validBins,
      df: degreesOfFreedom,
      numParams: finalNumParams,
      excludedCount: excludedBins.length,
      // ДОБАВЛЕНО: детальная информация для отладки
      calculationDetails: `validBins(${validBins}) - 1 - numParams(${finalNumParams}) = df(${degreesOfFreedom})`,
      topContributions: contributions
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3)
        .map(c => ({
          index: c.index,
          contribution: c.contribution.toFixed(3),
          observed: c.observed,
          expected: c.expected.toFixed(3)
        }))
    });

    return {
      value: chi2,
      degreesOfFreedom,
      validBins,
      excludedBins,
      contributions: contributions.slice(0, 3)
    };
  }, [logMessage]);

  // Исправленная функция analyzeDistributions, начиная со строки ~726
  const analyzeDistributions = useCallback((binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial, stats, significanceLevel) => {
    const distributionResults = [];
    const results = {};

    // ИСПРАВЛЕНО: четко определяем количество параметров для каждого распределения
    const distributionConfigs = [
      { 
        name: 'Poisson', 
        freqs: binnedPoisson, 
        numParams: 1,  // λ - только 1 параметр
        displayName: 'Пуассон'
      },
      { 
        name: 'Binomial', 
        freqs: binnedBinomial, 
        numParams: 2,  // n, p - 2 параметра
        displayName: 'Биномиальное'
      },
      { 
        name: 'NegativeBinomial', 
        freqs: binnedNegBinomial, 
        numParams: 2,  // ИСПРАВЛЕНО: r, p - тоже 2 параметра!
        displayName: 'Отрицательное биномиальное'
      }
    ];

    distributionConfigs.forEach(({ name, freqs, numParams, displayName }) => {
      logMessage('calc', `Анализ распределения ${name}`, {
        name,
        numParams,
        binnedLength: freqs.length,
        empiricalLength: binnedEmpirical.length
      });

      // ИСПРАВЛЕНО: теперь numParams передается правильно
      const chiSquareResult = computeChiSquare(binnedEmpirical, freqs, name, numParams);
      const chi2Value = chiSquareResult.value;
      const df = chiSquareResult.degreesOfFreedom;

      if (!isFinite(chi2Value) || !isFinite(df) || df <= 0) {
        logMessage('error', `Некорректный χ² расчет для ${name}`, { 
          chi2Value, df, numParams,
          validBins: chiSquareResult.validBins
        });
        return;
      }

      const pValue = 1 - jStat.chisquare.cdf(chi2Value, df);
      const criticalValue = jStat.chisquare.inv(1 - significanceLevel, df);
      const isAccepted = pValue >= significanceLevel;
      
      results[name] = {
        chiSquare: chi2Value,
        pValue: pValue,
        degreesOfFreedom: df,
        criticalValue: criticalValue,
        isAccepted: isAccepted,
        validBins: chiSquareResult.validBins,
        numParams: numParams
      };
      
      // ИСПРАВЛЕНО: логирование с правильными df
      logMessage('calc', `${displayName} - результаты`, {
        chi2: chi2Value.toFixed(3),
        df, // Теперь должно быть правильное значение
        criticalValue: criticalValue.toFixed(3),
        pValue: pValue.toFixed(6),
        isAccepted,
        numParams,
        validBins: chiSquareResult.validBins,
        // ДОБАВЛЕНО: проверка правильности df
        expectedDF: `validBins(${chiSquareResult.validBins}) - 1 - numParams(${numParams}) = ${chiSquareResult.validBins - 1 - numParams}`,
        actualDF: df
      });

      distributionResults.push({
        name,
        chi2: chi2Value,
        pValue,
        df,
        isAccepted,
        numParams
      });
    });

    // Остальная логика без изменений...
    const acceptedDistributions = distributionResults.filter(r => r.isAccepted);
    const bestDistribution = acceptedDistributions.length > 0 
      ? acceptedDistributions.reduce((best, current) => current.pValue > best.pValue ? current : best)
      : distributionResults.reduce((best, current) => current.pValue > best.pValue ? current : best);

    logMessage('calc', 'Сводка анализа распределений', {
      accepted: acceptedDistributions.map(d => d.name),
      best: bestDistribution,
      overallAccepted: acceptedDistributions.length > 0
    });

    return {
      results,
      distributionResults,
      bestDistribution: bestDistribution.name,
      overallAccepted: acceptedDistributions.length > 0,
      best: bestDistribution
    };
  }, [computeChiSquare, logMessage, getDistributionName, getDistributionParams]);

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
        const defect = Number(row.defects);
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
        totalFrequency: empiricalFrequencies.reduce((a, b) => a + b, 0)
      });

      const { poissonFrequencies, binomialFrequencies, negBinomialFrequencies } = calculateTheoreticalFrequencies(filteredDefects, stats);

      const { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial } = createOptimalBins(
        empiricalFrequencies, poissonFrequencies, binomialFrequencies, negBinomialFrequencies
      );

      const binLabels = bins.map(bin => bin.length === 1 ? bin[0].toString() : `${bin[0]}-${bin[bin.length - 1]}`);

      logMessage('calc', 'Оптимальные интервалы созданы', {
        binsCount: bins.length,
        binLabels,
        empiricalSum: binnedEmpirical.reduce((a, b) => a + b, 0),
        poissonSum: binnedPoisson.reduce((a, b) => a + b, 0).toFixed(2),
        binomialSum: binnedBinomial.reduce((a, b) => a + b, 0).toFixed(2),
        negBinomialSum: binnedNegBinomial.reduce((a, b) => a + b, 0).toFixed(2)
      });

      const analysisResults = analyzeDistributions(binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial, stats, analysis.significanceLevel);

      logMessage('calc', 'Анализ распределений завершен', {
        bestDistribution: analysisResults.bestDistribution,
        overallAccepted: analysisResults.overallAccepted,
        // ИСПРАВЛЕНО: используем distributionResults вместо accepted
        resultsCount: analysisResults.distributionResults ? analysisResults.distributionResults.length : 0,
        acceptedCount: analysisResults.distributionResults ? analysisResults.distributionResults.filter(r => r.isAccepted).length : 0
      });

      const finalAnalysis = {
        distribution: analysisResults.bestDistribution,
        parameters: getDistributionParams(analysisResults.bestDistribution, stats),
        empiricalFrequencies: binnedEmpirical,
        theoreticalFrequencies: {
          Poisson: binnedPoisson,
          Binomial: binnedBinomial,
          NegativeBinomial: binnedNegBinomial
        },
        chiSquareValues: {
          Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.chiSquare : 0,
          Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.chiSquare : 0,
          NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.chiSquare : 0
        },
        pValues: {
          Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.pValue : 0,
          Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.pValue : 0,
          NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.pValue : 0
        },
        degreesOfFreedom: {
          Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.degreesOfFreedom : 9,
          Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.degreesOfFreedom : 8,
          NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.degreesOfFreedom : 8
        },
        criticalValues: {
          Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.criticalValue : 0,
          Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.criticalValue : 0,
          NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.criticalValue : 0
        },
        significanceLevel: analysis.significanceLevel,
        hypothesisAccepted: analysisResults.overallAccepted,
        binLabels,
        meanCI: stats.meanCI,
        varianceCI: stats.varianceCI,
    };

    setAnalysis(prev => ({
      ...prev,
      distribution: analysisResults.bestDistribution,
      hypothesisAccepted: analysisResults.overallAccepted,
      
      // ИСПРАВЛЕНО: сохраняем результаты правильно
      chiSquareResults: analysisResults.results, // ← Добавить эту строку!
      chiSquareValues: {
        Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.chiSquare : 0,
        Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.chiSquare : 0,
        NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.chiSquare : 0
      },
      pValues: {
        Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.pValue : 0,
        Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.pValue : 0,
        NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.pValue : 0
      },
      
      // ИСПРАВЛЕНО: сохраняем df как объект для каждого распределения
      degreesOfFreedom: {
        Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.degreesOfFreedom : 9,
        Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.degreesOfFreedom : 8,
        NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.degreesOfFreedom : 8
      },
      
      criticalValues: {
        Poisson: analysisResults.results.Poisson ? analysisResults.results.Poisson.criticalValue : 0,
        Binomial: analysisResults.results.Binomial ? analysisResults.results.Binomial.criticalValue : 0,
        NegativeBinomial: analysisResults.results.NegativeBinomial ? analysisResults.results.NegativeBinomial.criticalValue : 0
      },
      
      // Остальные поля...
      empiricalFrequencies: binnedEmpirical,
      theoreticalFrequencies: {
        Poisson: binnedPoisson,
        Binomial: binnedBinomial,
        NegativeBinomial: binnedNegBinomial
      },
      binLabels,
      meanCI: stats.meanCI,
      varianceCI: stats.varianceCI,
      parameters: getDistributionParams(analysisResults.bestDistribution, stats)
    }));

    // Сохранение в историю ПОСЛЕ завершения анализа
    try {
      const testEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        data: data,
        analysis: finalAnalysis,
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
        entry.dataStats.recordCount !== data.length ||
        Math.abs(new Date(entry.timestamp).getTime() - Date.now()) > 5000
      );
      
      const updatedHistory = [...filteredHistory, testEntry];
      
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
      bestDistribution: analysisResults.best ? analysisResults.best.name : 'Не определено',
      bestChi2: analysisResults.best ? analysisResults.best.chi2.toFixed(3) : 'N/A',
      bestPValue: analysisResults.best ? analysisResults.best.pValue.toFixed(6) : 'N/A',
      hypothesisAccepted: analysisResults.overallAccepted,
      // ИСПРАВЛЕНО: используем distributionResults вместо accepted
      finalResults: analysisResults.distributionResults ? analysisResults.distributionResults.map(r => ({
        name: r.name,
        chi2: r.chi2.toFixed(3),
        pValue: r.pValue.toFixed(6),
        accepted: r.isAccepted
      })) : []
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
