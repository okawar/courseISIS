importScripts('/jstat.min.js');

self.onmessage = ({ data: { data, significanceLevel } }) => {
  const log = (level, message, data = {}) => {
    self.postMessage({ type: 'log', level, message, data });
  };

  const filterOutliers = (defects) => {
    const sortedDefects = [...defects].sort((a, b) => a - b);
    const n = defects.length;
    const Q1 = sortedDefects[Math.floor(n * 0.25)];
    const Q3 = sortedDefects[Math.floor(n * 0.75)];
    const IQR = Q3 - Q1;
    const lowerBoundIQR = Q1 - 1.5 * IQR;
    const upperBoundIQR = Q3 + 1.5 * IQR;

    const filteredDefects = defects.filter((d) => d <= upperBoundIQR);
    log('info', 'Фильтрация выбросов', {
      originalCount: defects.length,
      filteredCount: filteredDefects.length,
      Q1, Q3, IQR, lowerBoundIQR, upperBoundIQR
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
    const chi2Lower = jStat.chisquare.inv(0.975, n - 1);
    const chi2Upper = jStat.chisquare.inv(0.025, n - 1);
    const meanCI = [mean - 1.96 * seMean, mean + 1.96 * seMean];
    const varianceCI = [variance * (n - 1) / chi2Lower, variance * (n - 1) / chi2Upper];

    const distributions = [
      { name: 'Poisson', params: { lambda: mean }, numParams: 1 },
      { name: 'Binomial', params: { p: binomialP, adaptiveN: true }, numParams: 2 },
      {
        name: 'NegativeBinomial',
        params: {
          r: variance > mean ? (mean * mean) / (variance - mean) : 1,
          p: variance > mean ? 1 - mean / variance : 0.5
        },
        numParams: 2
      }
    ];

    log('info', 'Предложенное распределение', {
      mean, variance, defectRate, meanCI, varianceCI
    });

    return { mean, variance, defectRate, meanCI, varianceCI, distributions };
  };

  try {
    if (data.length === 0) {
      throw new Error('Данные отсутствуют. Пожалуйста, загрузите данные.');
    }

    const isValid = data.every((row, i) => {
      if (row.total < 0 || row.defects < 0 || row.defects > row.total || isNaN(row.total) || isNaN(row.defects)) {
        log('error', `Некорректные данные в строке ${i + 1}`, { total: row.total, defects: row.defects });
        return false;
      }
      return true;
    });

    if (!isValid) {
      throw new Error('Обнаружены некорректные данные (отрицательные значения, NaN или defects > total).');
    }

    if (data.length < 30) {
      throw new Error('Недостаточно данных (<30 записей) для анализа.');
    }

    const defects = data.map((item) => Number(item.defects) || 0);
    const totalItems = data.reduce((sum, row) => sum + row.total, 0);
    const filteredDefects = filterOutliers(defects);

    if (filteredDefects.length === 0) {
      throw new Error('После фильтрации выбросов данные отсутствуют.');
    }

    const { mean, variance, defectRate, meanCI, varianceCI, distributions } = suggestDistribution(filteredDefects, totalItems);
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

      return { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial };
    };

    const { bins, binnedEmpirical, binnedPoisson, binnedBinomial, binnedNegBinomial } = createOptimalBins(
      empiricalFrequencies, poissonFrequencies, binomialFrequencies, negBinomialFrequencies
    );
    const binLabels = bins.map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`));

    const computeChi2 = (observed, expected, distName, numParams) => {
      let chi2 = 0;
      let validBins = 0;
      for (let i = 0; i < observed.length; i++) {
        const o = observed[i];
        const e = expected[i];
        if (e >= 5 && o > 0) {
          chi2 += Math.pow(o - e, 2) / e;
          validBins++;
        }
      }
      const df = Math.max(validBins - 1 - numParams, 1);
      return { chi2: isFinite(chi2) ? chi2 : Infinity, validBins, df };
    };

    const { chi2: chi2_poisson, df: df_poisson } = computeChi2(binnedEmpirical, binnedPoisson, 'Poisson', 1);
    const { chi2: chi2_binomial, df: df_binomial } = computeChi2(binnedEmpirical, binnedBinomial, 'Binomial', 2);
    const { chi2: chi2_negBinomial, df: df_negBinomial } = computeChi2(binnedEmpirical, binnedNegBinomial, 'NegativeBinomial', 2);

    const critical_poisson = jStat.chisquare.inv(1 - significanceLevel, df_poisson);
    const critical_binomial = jStat.chisquare.inv(1 - significanceLevel, df_binomial);
    const critical_negBinomial = jStat.chisquare.inv(1 - significanceLevel, df_negBinomial);

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
        numParams: 2,
      },
    ];

    const best = results.reduce((prev, curr) => {
      const aicPrev = 2 * prev.numParams * Math.log(filteredDefects.length) + prev.chi2;
      const aicCurr = 2 * curr.numParams * Math.log(filteredDefects.length) + curr.chi2;
      return isFinite(aicCurr) && aicCurr < aicPrev ? curr : prev;
    }, { chi2: Infinity, numParams: Infinity });

    self.postMessage({
      type: 'result',
      analysis: {
        distribution: best.name || '',
        suggestedDistribution: best.name,
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
        significanceLevel,
        hypothesisAccepted: best.chi2 < best.critical && isFinite(best.chi2) && best.pValue > significanceLevel,
        chiSquareValue: best.chi2,
        pValue: best.pValue,
        binLabels,
        meanCI,
        varianceCI,
      }
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};