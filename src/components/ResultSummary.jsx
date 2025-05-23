import React, { useState } from 'react';
import { Button, Card, CardContent, TextField, Table, TableHead, TableRow, TableCell, TableBody, Snackbar, Alert, MenuItem } from '@mui/material';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const ResultSummary = ({ analysis, data, setAnalysis, setData, significanceLevel }) => {
  const distributions = ['Poisson', 'Normal', 'Binomial'];
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const handleDistributionChange = (e) => {
    setAnalysis(prev => ({ ...prev, distribution: e.target.value }));
  };

  const handleSignificanceChange = (e) => {
    const value = parseFloat(e.target.value);
    if (value >= 0.001 && value <= 0.20) {
      setAnalysis(prev => ({ ...prev, significanceLevel: value }));
      setSnackbarMessage('Перезапустите анализ, нажав "Применить", чтобы использовать новый уровень значимости.');
      setOpenSnackbar(true);
    } else {
      setSnackbarMessage('Уровень значимости должен быть в диапазоне [0.001, 0.20].');
      setOpenSnackbar(true);
    }
  };

  const handleApplySignificance = () => {
    // Перезапускаем анализ, вызывая useEffect в Dashboard.jsx
    setData([...data]);
  };

  const handleExportCSV = () => {
    const csvData = [
      ['Партия №', 'Всего деталей', 'Бракованных'],
      ...data.map((row, i) => [i + 1, row.total, row.defects]),
      [],
      ['Анализ'],
      ['Распределение', analysis.distribution],
      ['Параметры', JSON.stringify(analysis.parameters)],
      ...Object.entries(analysis.chiSquareValues).map(([key, value]) => [`χ² ${key}`, isFinite(value) ? value.toFixed(2) : 'N/A']),
      ...Object.entries(analysis.pValues).map(([key, value]) => [`p-значение ${key}`, isFinite(value) ? value.toFixed(4) : 'N/A']),
      ['Степени свободы', analysis.degreesOfFreedom],
      ['Уровень значимости', analysis.significanceLevel],
      ['Гипотеза', analysis.hypothesisAccepted ? 'Принимается' : 'Отвергается'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(csvData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'results.csv');
  };

  const handleExportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(data);
    const analysisSheet = XLSX.utils.aoa_to_sheet([
      ['Распределение', analysis.distribution],
      ['Параметры', JSON.stringify(analysis.parameters)],
      ...Object.entries(analysis.chiSquareValues).map(([key, value]) => [`χ² ${key}`, isFinite(value) ? value.toFixed(2) : 'N/A']),
      ...Object.entries(analysis.pValues).map(([key, value]) => [`p-значение ${key}`, isFinite(value) ? value.toFixed(4) : 'N/A']),
      ['Степени свободы', analysis.degreesOfFreedom],
      ['Уровень значимости', analysis.significanceLevel],
      ['Гипотеза', analysis.hypothesisAccepted ? 'Принимается' : 'Отвергается'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.utils.book_append_sheet(wb, analysisSheet, 'Analysis');
    XLSX.writeFile(wb, 'results.xlsx');
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('DefectAnalyzer - Результаты', 10, 10);
    doc.setFontSize(12);
    doc.text('Данные:', 10, 20);
    data.forEach((row, i) => {
      doc.text(`Партия ${i + 1}: Всего ${row.total}, Бракованных ${row.defects}`, 10, 30 + i * 10);
    });
    doc.text('Анализ:', 10, 30 + data.length * 10 + 10);
    doc.text(`Распределение: ${analysis.distribution}`, 10, 30 + data.length * 10 + 20);
    doc.text(`Параметры: ${JSON.stringify(analysis.parameters)}`, 10, 30 + data.length * 10 + 30);
    Object.entries(analysis.chiSquareValues).forEach(([key, value], i) => {
      doc.text(`χ² ${key}: ${isFinite(value) ? value.toFixed(2) : 'N/A'}`, 10, 30 + data.length * 10 + 40 + i * 10);
    });
    Object.entries(analysis.pValues).forEach(([key, value], i) => {
      doc.text(`p-значение ${key}: ${isFinite(value) ? value.toFixed(4) : 'N/A'}`, 10, 30 + data.length * 10 + 60 + Object.keys(analysis.chiSquareValues).length * 10 + i * 10);
    });
    doc.text(`Степени свободы: ${analysis.degreesOfFreedom}`, 10, 30 + data.length * 10 + 80 + Object.keys(analysis.chiSquareValues).length * 10);
    doc.text(`Уровень значимости: ${analysis.significanceLevel}`, 10, 30 + data.length * 10 + 90 + Object.keys(analysis.chiSquareValues).length * 10);
    doc.text(`Гипотеза: ${analysis.hypothesisAccepted ? 'Принимается' : 'Отвергается'}`, 10, 30 + data.length * 10 + 100 + Object.keys(analysis.chiSquareValues).length * 10);
    doc.save('results.pdf');
  };

  const handleToggleHistory = () => {
    setShowHistory(!showHistory);
  };

  const handleRestoreTest = (test) => {
    setData(test.data);
    setAnalysis(test.analysis);
    setSnackbarMessage('Тест восстановлен!');
    setOpenSnackbar(true);
  };

  const testHistory = JSON.parse(localStorage.getItem('testHistory') || '[]');
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Card className="rounded-lg shadow-md bg-white">
      <CardContent className="p-4">
        <p className="text-gray-700 mb-2">
          Предложенное распределение: <strong>{analysis.distribution}</strong>
        </p>
        <Table size="small" className="min-w-full mb-4">
          <TableHead>
            <TableRow className="bg-gray-100">
              <TableCell className="font-semibold text-gray-700">Распределение</TableCell>
              <TableCell className="font-semibold text-gray-700">χ²</TableCell>
              <TableCell className="font-semibold text-gray-700">Критическое значение</TableCell>
              <TableCell className="font-semibold text-gray-700">p-значение</TableCell>
              <TableCell className="font-semibold text-gray-700">Гипотеза</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {['Poisson', 'Binomial', 'Normal'].map((dist) => (
              <TableRow key={dist} className="hover:bg-gray-50">
                <TableCell className="text-gray-700">{dist}</TableCell>
                <TableCell className="text-gray-700">
                  {isFinite(analysis.chiSquareValues[dist]) ? analysis.chiSquareValues[dist].toFixed(2) : 'N/A'}
                </TableCell>
                <TableCell className="text-gray-700">{isFinite(analysis.chiSquareValues.criticalValue) ? analysis.chiSquareValues.criticalValue.toFixed(2) : 'N/A'}</TableCell>
                <TableCell className="text-gray-700">{isFinite(analysis.pValues[dist]) ? analysis.pValues[dist].toFixed(4) : 'N/A'}</TableCell>
                <TableCell className="text-gray-700">
                  {isFinite(analysis.chiSquareValues[dist]) && analysis.chiSquareValues[dist] < analysis.chiSquareValues.criticalValue ? 'Принимается' : 'Отвергается'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TextField
          select
          label="Выбрать распределение"
          value={analysis.distribution}
          onChange={handleDistributionChange}
          className="w-full mb-4"
          size="small"
        >
          {distributions.map(dist => (
            <MenuItem key={dist} value={dist}>{dist}</MenuItem>
          ))}
        </TextField>
        <div className="flex items-center gap-2 mb-4">
          <TextField
            type="number"
            label="Уровень значимости"
            value={analysis.significanceLevel}
            onChange={handleSignificanceChange}
            className="w-full"
            size="small"
            inputProps={{ step: 0.001, min: 0.001, max: 0.20 }}
          />
          <Button
            variant="contained"
            onClick={handleApplySignificance}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Применить
          </Button>
        </div>
        <Button
          variant="contained"
          onClick={handleToggleHistory}
          className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg mb-4"
        >
          {showHistory ? 'Скрыть историю тестов' : 'Показать историю тестов'}
        </Button>
        {showHistory && (
          <Table size="small" className="min-w-full mb-4">
            <TableHead>
              <TableRow className="bg-gray-100">
                <TableCell className="font-semibold text-gray-700">Время</TableCell>
                <TableCell className="font-semibold text-gray-700">Распределение</TableCell>
                <TableCell className="font-semibold text-gray-700">Действие</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {testHistory.map((test, i) => (
                <TableRow key={i} className="hover:bg-gray-50">
                  <TableCell className="text-gray-700">{new Date(test.timestamp).toLocaleString()}</TableCell>
                  <TableCell className="text-gray-700">{test.analysis.distribution}</TableCell>
                  <TableCell>
                    <Button
                      variant="contained"
                      onClick={() => handleRestoreTest(test)}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-2 rounded-lg"
                    >
                      Восстановить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex gap-4">
          <Button
            variant="contained"
            onClick={handleExportCSV}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Экспорт в CSV
          </Button>
          <Button
            variant="contained"
            onClick={handleExportXLSX}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Экспорт в XLSX
          </Button>
          <Button
            variant="contained"
            onClick={handleExportPDF}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg"
          >
            Экспорт в PDF
          </Button>
        </div>
        <Snackbar open={openSnackbar} autoHideDuration={6000} onClose={() => setOpenSnackbar(false)}>
          <Alert onClose={() => setOpenSnackbar(false)} severity="info" sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
};

export default ResultSummary;