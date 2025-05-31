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
    return (
      <Card className="rounded-lg shadow-md bg-white">
        <CardContent className="p-4">
          <Typography variant="body1" className="text-gray-500 text-center">
            Загрузка...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!Array.isArray(data) || data.length === 0 || !analysis?.empiricalFrequencies || !analysis?.binLabels) {
    return (
      <Card className="rounded-lg shadow-md bg-white">
        <CardContent className="p-4">
          <Typography variant="body1" className="text-gray-500 text-center">
            Нет данных для отображения
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const labels = analysis.binLabels;
  const empiricalFrequencies = analysis.empiricalFrequencies;
  const theoreticalFrequencies = analysis.theoreticalFrequencies;

  // Проверка на отрицательные или NaN значения
  const validateFrequencies = (freqs, name) => {
    if (!Array.isArray(freqs)) {
      console.warn(`${name} не является массивом:`, freqs);
      return Array(labels.length).fill(0);
    }
    
    return freqs.map((f, i) => {
      if (!Number.isFinite(f) || f < 0) {
        console.warn(`Некорректное значение в ${name}[${i}]:`, f);
        return 0;
      }
      return f;
    });
  };

  const validatedEmpirical = validateFrequencies(empiricalFrequencies, 'empiricalFrequencies');
  const validatedPoisson = validateFrequencies(theoreticalFrequencies.Poisson, 'Poisson');
  const validatedBinomial = validateFrequencies(theoreticalFrequencies.Binomial, 'Binomial');
  const validatedNegBinomial = validateFrequencies(theoreticalFrequencies.NegativeBinomial, 'NegativeBinomial');

  // Исправленные расчеты PMF на основе параметров
  const poissonPMF = labels.map((label, k) => {
    const lambda = analysis.parameters?.lambda || 1;
    if (label.includes('-')) {
      const [start, end] = label.split('-').map(Number);
      let prob = 0;
      for (let i = start; i <= end; i++) {
        prob += jStat.poisson.pdf(i, lambda);
      }
      return prob;
    }
    return jStat.poisson.pdf(k, lambda);
  });

  const binomialPMF = labels.map((label, k) => {
    const n = analysis.parameters?.n || 100;
    const p = analysis.parameters?.p || 0.05;
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

  // Исправлен расчет для отрицательного биномиального распределения
  const negBinomialPMF = labels.map((label, k) => {
    const r = analysis.parameters?.r || 1;
    const p = analysis.parameters?.p || 0.5;
    if (label.includes('-')) {
      const [start, end] = label.split('-').map(Number);
      let prob = 0;
      for (let i = start; i <= end; i++) {
        // ИСПРАВЛЕНИЕ: проверяем корректность параметров
        if (r > 0 && p > 0 && p < 1) {
          // p здесь - вероятность успеха, но jStat ожидает вероятность неуспеха
          prob += jStat.negbin.pdf(i, r, 1 - p);
        }
      }
      return prob;
    }
    // ИСПРАВЛЕНИЕ: аналогично для одиночных значений
    if (r > 0 && p > 0 && p < 1) {
      return jStat.negbin.pdf(k, r, 1 - p);
    }
    return 0;
  });

  const formatNumber = (value) => {
    if (!Number.isFinite(value)) return '0';
    return value < 0.001 ? value.toExponential(2) : value.toFixed(3);
  };

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Эмпирические частоты',
        data: validatedEmpirical,
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        type: 'bar',
      },
      {
        label: 'Пуассон (теор.)',
        data: validatedPoisson,
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderWidth: 2,
        type: 'line',
        fill: false,
        tension: 0.1,
        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
        pointBorderColor: 'rgba(255, 99, 132, 1)',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
      {
        label: 'Биномиальное (теор.)',
        data: validatedBinomial,
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderWidth: 2,
        type: 'line',
        fill: false,
        tension: 0.1,
        pointBackgroundColor: 'rgba(75, 192, 192, 1)',
        pointBorderColor: 'rgba(75, 192, 192, 1)',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
      {
        label: 'Отрицательное биномиальное (теор.)',
        data: validatedNegBinomial,
        borderColor: 'rgba(255, 206, 86, 1)',
        backgroundColor: 'rgba(255, 206, 86, 0.2)',
        borderWidth: 2,
        type: 'line',
        fill: false,
        tension: 0.1,
        pointBackgroundColor: 'rgba(255, 206, 86, 1)',
        pointBorderColor: 'rgba(255, 206, 86, 1)',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            size: 12,
            family: 'Roboto, sans-serif'
          },
          padding: 20
        }
      },
      title: {
        display: true,
        text: 'Сравнение эмпирических и теоретических частот',
        font: {
          size: 14,
          weight: 'bold'
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 12,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y || 0;
            return `${label}: ${formatNumber(value)}`;
          },
          afterLabel: (context) => {
            const index = context.dataIndex;
            if (context.dataset.label === 'Пуассон (теор.)') {
              return `PMF: ${formatNumber(poissonPMF[index])}`;
            } else if (context.dataset.label === 'Биномиальное (теор.)') {
              return `PMF: ${formatNumber(binomialPMF[index])}`;
            } else if (context.dataset.label === 'Отрицательное биномиальное (теор.)') {
              return `PMF: ${formatNumber(negBinomialPMF[index])}`;
            }
            return null;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Количество дефектов',
          font: {
            weight: 'bold'
          }
        },
        ticks: {
          font: {
            size: 11
          }
        }
      },
      y: {
        title: {
          display: true,
          text: 'Частота',
          font: {
            weight: 'bold'
          }
        },
        beginAtZero: true,
        ticks: {
          callback: (value) => Number(value).toFixed(0),
          font: {
            size: 11
          }
        }
      }
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart'
    }
  };

  return (
    <Card className="rounded-lg shadow-md bg-white">
      <CardContent className="p-4">
        <div style={{ height: '400px', position: 'relative' }}>
          <Bar data={chartData} options={options} />
        </div>
        {analysis.distribution && (
          <Typography variant="body2" className="text-gray-600 mt-2 text-center">
            Лучшее соответствие: <strong>{analysis.distribution}</strong>
            {analysis.parameters && (
              <span className="ml-2">
                (
                {analysis.distribution === 'Poisson' && `λ = ${formatNumber(analysis.parameters.lambda)}`}
                {analysis.distribution === 'Binomial' && `n = ${analysis.parameters.n}, p = ${formatNumber(analysis.parameters.p)}`}
                {analysis.distribution === 'NegativeBinomial' && `r = ${formatNumber(analysis.parameters.r)}, p = ${formatNumber(analysis.parameters.p)}`}
                )
              </span>
            )}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default DistributionChart;
