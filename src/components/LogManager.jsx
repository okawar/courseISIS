import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Chip,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Badge,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Clear as ClearIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import logger from '../utils/Logger';

const LogManager = ({ open, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    level: '',
    component: '',
    search: ''
  });
  const [stats, setStats] = useState({});
  const [selectedLog, setSelectedLog] = useState(null);

  // Обновление логов
  const refreshLogs = useCallback(() => {
    const filteredLogs = logger.getLogs(filters);
    setLogs(filteredLogs);
    setStats(logger.getStats());
  }, [filters]);

  // Автообновление логов
  useEffect(() => {
    if (!open) return;

    refreshLogs();
    
    const removeListener = logger.addListener(() => {
      refreshLogs();
    });

    const interval = setInterval(refreshLogs, 2000);

    return () => {
      removeListener();
      clearInterval(interval);
    };
  }, [open, refreshLogs]);

  // Обработчики фильтров
  const handleFilterChange = useCallback((field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Очистка логов
  const handleClearLogs = useCallback(() => {
    logger.clearLogs();
    refreshLogs();
  }, [refreshLogs]);

  // Экспорт логов
  const handleExport = useCallback((format) => {
    try {
      const exportData = logger.exportLogs(format);
      const blob = new Blob([exportData], { 
        type: format === 'json' ? 'application/json' : 'text/csv' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
    }
  }, []);

  // Цвета для уровней логирования
  const getLevelColor = (level) => {
    const colors = {
      debug: 'default',
      info: 'info',
      calc: 'primary',
      warning: 'warning',
      error: 'error'
    };
    return colors[level] || 'default';
  };

  // Мемоизированные компоненты статистики
  const statsComponent = useMemo(() => (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        Статистика логов
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label={`Всего: ${stats.totalLogs || 0}`} color="primary" />
        {Object.entries(stats.levelCounts || {}).map(([level, count]) => (
          <Chip 
            key={level} 
            label={`${level}: ${count}`} 
            color={getLevelColor(level)}
            size="small"
          />
        ))}
      </Box>
    </Box>
  ), [stats]);

  // Мемоизированная таблица логов
  const logsTable = useMemo(() => (
    <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>Время</TableCell>
            <TableCell>Уровень</TableCell>
            <TableCell>Компонент</TableCell>
            <TableCell>Сообщение</TableCell>
            <TableCell>Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow 
              key={log.id} 
              hover
              sx={{ 
                cursor: 'pointer',
                backgroundColor: log.level === 'error' ? 'rgba(211, 47, 47, 0.08)' : 'inherit'
              }}
              onClick={() => setSelectedLog(log)}
            >
              <TableCell>
                <Typography variant="caption">
                  {new Date(log.timestamp).toLocaleTimeString('ru-RU')}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip 
                  label={log.level} 
                  color={getLevelColor(log.level)} 
                  size="small" 
                />
              </TableCell>
              <TableCell>
                <Typography variant="body2" noWrap>
                  {log.component}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                  {log.message}
                </Typography>
              </TableCell>
              <TableCell>
                <IconButton 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLog(log);
                  }}
                >
                  <SearchIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center">
                <Typography color="textSecondary">
                  Логи отсутствуют
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  ), [logs]);

  return (
    <>
      {/* Основное окно менеджера логов */}
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: { height: '80vh' }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Менеджер логов</Typography>
            <Box>
              <Tooltip title="Обновить">
                <IconButton onClick={refreshLogs}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Очистить логи">
                <IconButton onClick={handleClearLogs} color="error">
                  <ClearIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {statsComponent}
          
          {/* Фильтры */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Уровень</InputLabel>
              <Select
                value={filters.level}
                onChange={(e) => handleFilterChange('level', e.target.value)}
                label="Уровень"
              >
                <MenuItem value="">Все</MenuItem>
                <MenuItem value="debug">Debug</MenuItem>
                <MenuItem value="info">Info</MenuItem>
                <MenuItem value="calc">Calc</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="error">Error</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              size="small"
              label="Компонент"
              value={filters.component}
              onChange={(e) => handleFilterChange('component', e.target.value)}
              sx={{ minWidth: 150 }}
            />
            
            <TextField
              size="small"
              label="Поиск в сообщении"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              sx={{ flexGrow: 1, minWidth: 200 }}
            />
          </Box>

          {/* Таблица логов */}
          {logsTable}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => handleExport('json')} startIcon={<DownloadIcon />}>
            Экспорт JSON
          </Button>
          <Button onClick={() => handleExport('csv')} startIcon={<DownloadIcon />}>
            Экспорт CSV
          </Button>
          <Button onClick={onClose}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* Модальное окно деталей лога */}
      <Dialog
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Детали лога
        </DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Время:</strong> {new Date(selectedLog.timestamp).toLocaleString('ru-RU')}
              </Typography>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Уровень:</strong> 
                <Chip 
                  label={selectedLog.level} 
                  color={getLevelColor(selectedLog.level)} 
                  size="small" 
                  sx={{ ml: 1 }}
                />
              </Typography>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Компонент:</strong> {selectedLog.component}
              </Typography>
              <Typography variant="subtitle2" gutterBottom>
                <strong>Сообщение:</strong> {selectedLog.message}
              </Typography>
              
              {selectedLog.data && Object.keys(selectedLog.data).length > 0 && (
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle2">
                      <strong>Данные</strong>
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper 
                      variant="outlined" 
                      sx={{ p: 2, backgroundColor: 'grey.50', overflow: 'auto' }}
                    >
                      <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                        {JSON.stringify(selectedLog.data, null, 2)}
                      </pre>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedLog(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default LogManager;