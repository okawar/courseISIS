import React from 'react';
import { Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  LineElement, 
  PointElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { jStat } from 'jstat';
import annotationPlugin from 'chartjs-plugin-annotation';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  LineElement, 
  PointElement, 
  Title, 
  Tooltip, 
  Legend, 
  annotationPlugin
);

const ChiSquareVisualization = ({ analysis }) => {
  // Исправлена проверка наличия данных
  if (!analysis || !analysis.distribution || !isFinite(analysis.chiSquareValues?.[analysis.distribution]) || !isFinite(analysis.degreesOfFreedom)) {
    return (
      <Card className="rounded-lg shadow-md bg-white">
        <CardContent className="p-4">
          <Typography variant="body1" className="text-gray-500 text-center">
            Недостаточно данных для анализа
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const distribution = analysis.distribution;
  const df = analysis.degreesOfFreedom; // Исправлено - это число, не объект
  const chiSquareValue = analysis.chiSquareValues[distribution];
  const pValue = analysis.pValues[distribution];
  const significanceLevel = analysis.significanceLevel || 0.05;

  if (df < 1) {
    return (
      <Card className="rounded-lg shadow-md bg-white">
        <CardContent className="p-4">
          <Typography variant="body1" className="text-red-500 text-center">
            Ошибка: Степень свободы должна быть больше или равна 1
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const criticalValue = jStat.chisquare.inv(1 - significanceLevel, df);
  const hypothesisAccepted = (
    isFinite(chiSquareValue) &&
    isFinite(criticalValue) &&
    isFinite(pValue) &&
    chiSquareValue < criticalValue &&
    pValue >= significanceLevel
  );

  const maxX = Math.max(30, chiSquareValue * 1.5, criticalValue * 1.5);
  const step = maxX > 50 ? 1 : 0.5;
  const xValues = Array(Math.ceil(maxX / step)).fill(0).map((_, i) => i * step);

  const datasets = [
    {
      label: `χ² (df=${df})`,
      data: xValues.map(x => jStat.chisquare.pdf(x, df) || 0),
      borderColor: '#ff6384',
      backgroundColor: '#ff6384',
      borderWidth: 2,
      fill: false,
      tension: 0.1,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
    },
  ];

  const keyPoints = [
    {
      x: chiSquareValue,
      y: jStat.chisquare.pdf(chiSquareValue, df),
      label: `χ² = ${chiSquareValue.toFixed(2)}`,
      color: '#ff0000'
    },
    {
      x: criticalValue,
      y: jStat.chisquare.pdf(criticalValue, df),
      label: `Критическое χ² = ${criticalValue.toFixed(2)}`,
      color: '#00aa00'
    }
  ];

  datasets.push({
    label: 'Ключевые точки',
    data: keyPoints,
    pointBackgroundColor: keyPoints.map(p => p.color),
    pointBorderColor: keyPoints.map(p => p.color),
    pointRadius: 5,
    pointHoverRadius: 8,
    pointBorderWidth: 2,
    showLine: false,
    borderWidth: 0
  });

  const annotations = [
    {
      type: 'line',
      mode: 'vertical',
      scaleID: 'x',
      value: chiSquareValue,
      borderColor: '#ff0000',
      borderWidth: 2,
      borderDash: [6, 6],
      label: {
        content: `χ² = ${chiSquareValue.toFixed(2)}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(255,255,255,0.8)',
        font: { size: 12, weight: 'bold' },
        color: '#ff0000',
        yAdjust: -20,
        xAdjust: 0
      }
    },
    {
      type: 'line',
      mode: 'vertical',
      scaleID: 'x',
      value: criticalValue,
      borderColor: '#00aa00',
      borderWidth: 2,
      borderDash: [6, 6],
      label: {
        content: `Критическое χ² = ${criticalValue.toFixed(2)}`,
        enabled: true,
        position: 'top',
        backgroundColor: 'rgba(255,255,255,0.8)',
        font: { size: 12, weight: 'bold' },
        color: '#00aa00',
        yAdjust: -20,
        xAdjust: 0
      }
    },
    {
      type: 'box',
      xMin: criticalValue,
      xMax: maxX,
      backgroundColor: 'rgba(255, 0, 0, 0.1)',
      borderColor: 'rgba(255, 0, 0, 0.3)',
      borderWidth: 1,
      label: {
        content: `Критическая область (α=${significanceLevel})`,
        enabled: true,
        position: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        font: { size: 12, weight: 'bold' },
        color: '#ff0000'
      }
    }
  ];

  const tooltipCallbacks = {
    label: (context) => {
      const label = context.dataset.label || '';
      const value = context.parsed.y || 0;
      if (label === 'Ключевые точки') {
        const point = keyPoints[context.dataIndex];
        return `${point.label}: P(x) = ${value.toFixed(4)}`;
      }
      return `${label}: ${value.toFixed(4)}`;
    },
    afterLabel: (context) => {
      if (context.dataset.label === 'Ключевые точки') {
        const point = keyPoints[context.dataIndex];
        return `P(x) = ${point.y.toFixed(4)}`;
      }
      return null;
    },
    title: (context) => {
      return `χ² = ${context[0].parsed.x.toFixed(2)}`;
    }
  };

  const maxDensity = Math.max(...datasets[0].data);
  const yStep = Math.max(0.01, maxDensity / 5);

  const hasLowFrequencies = analysis.theoreticalFrequencies?.[distribution]?.some(f => f < 5);

  return (
    <Card className="rounded-lg shadow-md bg-white">
      <CardContent className="p-4">
        <Typography variant="h6" className="text-gray-800 font-semibold mb-4">
          Результаты хи-квадрат анализа
        </Typography>
        
        <Box className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>Выбранное распределение:</strong> {distribution || 'Нет подходящего распределения'}
            </Typography>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>Параметры:</strong> {
                distribution === 'Binomial'
                  ? `p=${analysis.parameters.p?.toFixed(4) || 'N/A'}, n=${analysis.parameters.n || 'N/A'}`
                  : distribution === 'Poisson'
                  ? `λ=${analysis.parameters.lambda?.toFixed(2) || 'N/A'}`
                  : distribution === 'NegativeBinomial'
                  ? `r=${analysis.parameters.r?.toFixed(2) || 'N/A'}, p=${analysis.parameters.p?.toFixed(4) || 'N/A'}`
                  : 'N/A'
              }
            </Typography>
          </div>
          <div>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>Значение χ²:</strong> {isFinite(chiSquareValue) ? chiSquareValue.toFixed(2) : 'N/A'}
            </Typography>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>p-значение:</strong> {isFinite(pValue) ? pValue.toFixed(4) : 'N/A'}
            </Typography>
          </div>
          <div>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>Степени свободы:</strong> {df}
            </Typography>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>Уровень значимости:</strong> {significanceLevel.toFixed(2)}
            </Typography>
          </div>
          <div>
            <Typography variant="subtitle1" className="text-gray-700">
              <strong>Гипотеза:</strong> 
              <span className={hypothesisAccepted ? 'text-green-600' : 'text-red-600'}>
                {hypothesisAccepted ? ' Принимается' : ' Отвергается'}
              </span>
            </Typography>
            {hasLowFrequencies && (
              <Typography variant="subtitle2" className="text-red-500">
                Предупреждение: некоторые ожидаемые частоты меньше 5, тест хи-квадрат может быть ненадёжным
              </Typography>
            )}
            {!hypothesisAccepted && distribution === 'None' && (
              <Typography variant="subtitle2" className="text-red-500">
                Ни одно распределение не соответствует данным
              </Typography>
            )}
          </div>
        </Box>

        <Typography variant="h6" className="text-gray-800 font-semibold mt-4 mb-2">
          Распределение хи-квадрат (df={df})
        </Typography>
        
        <div style={{ height: '400px', position: 'relative' }}>
          <Line
            data={{ labels: xValues, datasets }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'top',
                  labels: {
                    font: {
                      size: 12,
                      family: 'Roboto, sans-serif'
                    },
                    padding: 20,
                    usePointStyle: true,
                    pointStyle: 'circle'
                  }
                },
                title: { 
                  display: true, 
                  text: `Распределение хи-квадрат (df=${df})`,
                  font: {
                    size: 14,
                    weight: 'bold'
                  },
                  padding: {
                    top: 10,
                    bottom: 20
                  }
                },
                annotation: { annotations },
                tooltip: {
                  callbacks: tooltipCallbacks,
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  titleFont: { size: 14, weight: 'bold' },
                  bodyFont: { size: 12 },
                  padding: 12,
                  displayColors: true,
                  usePointStyle: true,
                  intersect: false,
                  mode: 'index'
                }
              },
              scales: {
                x: {
                  type: 'linear',
                  title: { 
                    display: true, 
                    text: 'Значение χ²',
                    font: {
                      weight: 'bold'
                    }
                  },
                  min: 0,
                  max: maxX,
                  ticks: {
                    stepSize: maxX > 50 ? 10 : 5,
                    callback: (value) => Number(value).toFixed(value % 1 === 0 ? 0 : 1)
                  },
                  grid: {
                    display: false
                  }
                },
                y: {
                  title: { 
                    display: true, 
                    text: 'Плотность вероятности',
                    font: {
                      weight: 'bold'
                    }
                  },
                  beginAtZero: true,
                  ticks: {
                    stepSize: yStep,
                    callback: (value) => Number(value).toFixed(3)
                  }
                }
              },
              animation: {
                duration: 1000
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default ChiSquareVisualization;
