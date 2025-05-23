import React, { useState } from 'react';
import {
  Table, TableHead, TableRow, TableCell, TableBody,
  TextField, Button, TablePagination
} from '@mui/material';

const DataTable = ({ data, setData }) => {
  const [page, setPage] = useState(0);
  const rowsPerPage = 5;

  const handleChange = (index, field, value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      alert('Значение не может быть отрицательным или пустым');
      return;
    }
    if (field === 'defects') {
      const total = data[index].total || 0;
      if (numValue > total) {
        alert('Количество бракованных деталей не может превышать общее количество');
        return;
      }
    }

    const newData = [...data];
    newData[index][field] = numValue;
    setData(newData);
  };

  const handleAddBatch = () => {
    setData([...data, { total: 0, defects: 0 }]);
  };

  const handleResetData = () => {
    setData([{ total: 0, defects: 0 }]);
    setPage(0);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const visibleRows = data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <div>
      <div className="flex gap-4 mb-4">
        <Button
          variant="contained"
          onClick={handleAddBatch}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg"
        >
          Добавить партию
        </Button>
        <Button
          variant="contained"
          onClick={handleResetData}
          className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg"
        >
          Сбросить данные
        </Button>
      </div>
      <Table size="small" className="min-w-full">
        <TableHead>
          <TableRow className="bg-gray-100">
            <TableCell className="font-semibold text-gray-700">Партия №</TableCell>
            <TableCell className="font-semibold text-gray-700">Всего деталей</TableCell>
            <TableCell className="font-semibold text-gray-700">Бракованных</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibleRows.map((row, i) => (
            <TableRow key={page * rowsPerPage + i} className="hover:bg-gray-50">
              <TableCell className="text-gray-700">{page * rowsPerPage + i + 1}</TableCell>
              <TableCell>
                <TextField
                  type="number"
                  value={row.total}
                  onChange={(e) => handleChange(page * rowsPerPage + i, 'total', e.target.value)}
                  className="w-24"
                  size="small"
                  inputProps={{ min: 0 }}
                />
              </TableCell>
              <TableCell>
                <TextField
                  type="number"
                  value={row.defects}
                  onChange={(e) => handleChange(page * rowsPerPage + i, 'defects', e.target.value)}
                  className="w-24"
                  size="small"
                  inputProps={{ min: 0 }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        component="div"
        count={data.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[rowsPerPage]}
      />
    </div>
  );
};

export default DataTable;
