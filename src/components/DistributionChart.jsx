import React from 'react';
import { Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  LineElement, 
  PointElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Card, CardContent, Typography } from '@mui/material';
import { jStat } from 'jstat';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  LineElement, 
  PointElement, 
  Title, 
  Tooltip, 
  Legend
);

const DistributionChart = ({ data, analysis, isLoading }) => {
  if (isLoading) {
    return <div className="text-gray-500 text-center">Загрузка...</div>;
  }

  if (!Array.isArray(data) || data.length === 0 || !analysis?.empiricalFrequencies || !analysis?.binLabels) {
    console.log('[DistributionChart] Ошибка: данные отсутствуют или некорректны', { data, analysis });
    return <div className="text-gray-500 text-center">Данные отсутствуют</div>;
  }

  const labels = analysis.binLabels;
  const empiricalFrequencies = analysis.empiricalFrequencies;
  const theoreticalFrequencies = analysis.theoreticalFrequencies;

  // Проверка на отрицательные или NaN значения
  const validateFrequencies = (freqs, name) => {
    return freqs.map((val, i) => {
      if (isNaN(val) || val < 0) {
        console.warn(`[DistributionChart] Некорректное значение в ${name} на индексе ${i}: ${val}`);
        return 0;
      }
      return val;
    });
  };

  const validatedEmpirical = validateFrequencies(empiricalFrequencies, 'empiricalFrequencies');
  const validatedPoisson = validateFrequencies(theoreticalFrequencies.Poisson, 'Poisson');
  const validatedBinomial = validateFrequencies(theoreticalFrequencies.Binomial, 'Binomial');
  const validatedNegBinomial = validateFrequencies(theoreticalFrequencies.NegativeBinomial, 'NegativeBinomial');

  // Расчет PMF на основе параметров
  const poissonPMF = labels.map((label, k) => {
    const lambda = analysis.parameters?.lambda || 6.179;
    // Учитываем объединенные интервалы (например, "0-1")
    if (label.includes('-')) {
      const [start, end] = label.split('-').map(Number);
      let prob = 0;
      for (let i = start; i <= end; i++) {
        prob += Math.exp(-lambda) * Math.pow(lambda, i) / jStat.factorial(i);
      }
      return prob;
    }
    return Math.exp(-lambda) * Math.pow(lambda, k) / jStat.factorial(k);
  });

  const binomialPMF = labels.map((label, k) => {
    const p = analysis.parameters?.p || 0.049;
    const n = analysis.parameters?.n || 126;
    if (label.includes('-')) {
      const [start, end] = label.split('-').map(Number);
      let prob = 0;
      for (let i = start; i <= end; i++) {
        prob += jStat.binomial.pdf(i, n, p);
      }
      return prob;
    }
    return jStat.binomial.pdf(k, n, p);
  });

  const negBinomialPMF = labels.map((label, k) => {
    const r = analysis.parameters?.r || 1;
    const p = analysis.parameters?.p || 0.5;
    if (label.includes('-')) {
      const [start, end] = label.split('-').map(Number);
      let prob = 0;
      for (let i = start; i <= end; i++) {
        prob += jStat.negbin.pdf(i, r, p);
      }
      return prob;
    }
    return jStat.negbin.pdf(k, r, p);
  });

  console.log('[DistributionChart] PMF рассчитаны', {
    poissonPMF,
    binomialPMF,
    negBinomialPMF,
  });

  const formatNumber = (value) => {
    if (value >= 1000) return value.toFixed(0);
    if (value >= 100) return value.toFixed(1);
    if (value >= 10) return value.toFixed(2);
    return value.toFixed(3);
  };

  const datasets = [
    {
      type: 'bar',
      label: 'Эмпирические частоты',
      data: validatedEmpirical,
      backgroundColor: 'rgba(75, 192, 192, 0.7)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
      yAxisID: 'y',
      order: 6,
    },
    {
      type: 'line',
      label: 'Теоретическое (Пуассон)',
      data: validatedPoisson,
      borderColor: '#ff6384',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'y',
      order: 3,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'Теоретическое (Биномиальное)',
      data: validatedBinomial,
      borderColor: '#36a2eb',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'y',
      order: 4,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'Теоретическое (Отрицательное биномиальное)',
      data: validatedNegBinomial,
      borderColor: '#ffce56',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'y',
      order: 5,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'PMF (Пуассон)',
      data: poissonPMF,
      borderColor: '#ff6384',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      yAxisID: 'y2',
      order: 0,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'PMF (Биномиальное)',
      data: binomialPMF,
      borderColor: '#36a2eb',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      yAxisID: 'y2',
      order: 1,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'PMF (Отрицательное биномиальное)',
      data: negBinomialPMF,
      borderColor: '#ffce56',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      yAxisID: 'y2',
      order: 2,
      tension: 0.1,
    },
  ];

  const options = {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            size: 12,
            family: 'Roboto, sans-serif',
          },
          padding: 20,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y || 0;
            const isPMF = label.includes('PMF');
            return `${label}: ${formatNumber(value)} ${isPMF ? '(вероятность)' : '(частота)'}`;
          },
          afterLabel: (context) => {
            if (context.datasetIndex === 0) {
              const bin = labels[context.dataIndex];
              return `Интервал: ${bin}`;
            }
            return null;
          },
        },
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        displayColors: true,
        usePointStyle: true,
      },
      title: {
        display: true,
        text: 'Сравнение эмпирических и теоретических частот с PMF (интервалы оптимизированы для хи-квадрат теста)',
        font: {
          size: 16,
          weight: 'bold',
        },
        padding: {
          top: 10,
          bottom: 20,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Количество бракованных деталей',
          font: {
            weight: 'bold',
          },
        },
        grid: {
          display: false,
        },
      },
      y: {
        title: {
          display: true,
          text: 'Частота',
          font: {
            weight: 'bold',
          },
        },
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
        position: 'left',
      },
      y2: {
        title: {
          display: true,
          text: 'Вероятность (PMF)',
          font: {
            weight: 'bold',
          },
        },
        beginAtZero: true,
        max: 1,
        ticks: {
          precision: 3,
        },
        position: 'right',
        grid: {
          drawOnChartArea: false,
        },
      },
    },
    animation: {
      duration: 1000,
    },
  };

  return (
    <Card className="rounded-lg shadow-md bg-white">
      <CardContent className="p-4">
        <div style={{ position: 'relative', height: '400px', width: '100%' }}>
          <Bar data={{ labels, datasets }} options={options} />
        </div>
      </CardContent>
    </Card>
  );
};

export default DistributionChart;