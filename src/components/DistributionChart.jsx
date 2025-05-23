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
    return <div className="text-gray-500 text-center">Данные отсутствуют</div>;
  }

  const labels = analysis.binLabels;
  const empiricalFrequencies = analysis.empiricalFrequencies;
  const theoreticalFrequencies = analysis.theoreticalFrequencies;

  // Форматирование чисел для tooltips
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
      data: empiricalFrequencies,
      backgroundColor: 'rgba(75, 192, 192, 0.7)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
      yAxisID: 'y',
      order: 4, // Отрисовывается последним
    },
    {
      type: 'line',
      label: 'Теоретическое (Пуассон)',
      data: theoreticalFrequencies.Poisson,
      borderColor: '#ff6384',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'y',
      order: 1,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'Теоретическое (Биномиальное)',
      data: theoreticalFrequencies.Binomial,
      borderColor: '#36a2eb',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'y',
      order: 2,
      tension: 0.1,
    },
    {
      type: 'line',
      label: 'Теоретическое (Нормальное)',
      data: theoreticalFrequencies.Normal,
      borderColor: '#ffce56',
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      fill: false,
      yAxisID: 'y',
      order: 3,
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
            return `${label}: ${formatNumber(value)}`;
          },
          afterLabel: (context) => {
            if (context.datasetIndex === 0) {
              const bin = labels[context.dataIndex];
              return `Интервал: ${bin}`;
            }
            return null;
          }
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
        text: 'Сравнение эмпирических и теоретических частот',
        font: {
          size: 16,
          weight: 'bold',
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
    },
    scales: {
      x: {
        title: { 
          display: true, 
          text: 'Количество бракованных деталей',
          font: {
            weight: 'bold'
          }
        },
        grid: {
          display: false
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
          precision: 0
        }
      },
    },
    animation: {
      duration: 1000,
    },
  };

  return (
    <Card className="rounded-lg shadow-md bg-white">
      <CardContent className="p-4">
        <Bar 
          data={{ labels, datasets }} 
          options={options}
          height={400}
        />
      </CardContent>
    </Card>
  );
};

export default DistributionChart;