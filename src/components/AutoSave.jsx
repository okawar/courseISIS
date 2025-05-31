import { useEffect, useRef } from 'react';
import { log } from '../utils/Logger';

const AutoSave = ({ data, analysis, enabled = true, intervalMs = 60000 }) => {
  const intervalRef = useRef(null);
  const lastSaveRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const saveData = () => {
      try {
        if (!data || data.length === 0) {
          return;
        }

        const savePayload = {
          data,
          analysis,
          timestamp: new Date().toISOString(),
          version: '1.0'
        };

        // Проверяем, изменились ли данные с последнего сохранения
        const currentDataHash = JSON.stringify(savePayload);
        if (lastSaveRef.current === currentDataHash) {
          return;
        }

        localStorage.setItem('autoSave_defectAnalyzer', currentDataHash);
        lastSaveRef.current = currentDataHash;

        log('info', 'Автосохранение выполнено', {
          component: 'AutoSave',
          dataLength: data.length,
          analysisDistribution: analysis?.distribution || 'none',
          timestamp: savePayload.timestamp
        });

      } catch (error) {
        log('error', 'Ошибка автосохранения', {
          component: 'AutoSave',
          error: error.message,
          dataLength: data?.length || 0
        });
      }
    };

    // Немедленное сохранение при изменении данных
    if (data && data.length > 0) {
      saveData();
    }

    // Установка интервала для периодического сохранения
    intervalRef.current = setInterval(saveData, intervalMs);

    // Очистка при размонтировании
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [data, analysis, enabled, intervalMs]);

  // Компонент не рендерит никакого UI
  return null;
};

// Хук для автовосстановления данных
export const useAutoRestore = (setData, setAnalysis) => {
  const hasAutoSave = useRef(false);
  const autoSaveData = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('autoSave_defectAnalyzer');
      if (saved) {
        const parsedData = JSON.parse(saved);
        
        // Проверяем валидность данных
        if (parsedData.data && Array.isArray(parsedData.data) && parsedData.data.length > 0) {
          hasAutoSave.current = true;
          autoSaveData.current = parsedData;
          
          log('info', 'Найдено автосохранение', {
            component: 'AutoSave',
            timestamp: parsedData.timestamp,
            dataLength: parsedData.data.length,
            hasAnalysis: !!parsedData.analysis?.distribution
          });
        }
      }
    } catch (error) {
      log('error', 'Ошибка при чтении автосохранения', {
        component: 'AutoSave',
        error: error.message
      });
      localStorage.removeItem('autoSave_defectAnalyzer');
    }
  }, []);

  const restoreAutoSave = () => {
    if (autoSaveData.current) {
      try {
        setData(autoSaveData.current.data || []);
        setAnalysis(autoSaveData.current.analysis || {
          distribution: '',
          parameters: {},
          empiricalFrequencies: [],
          theoreticalFrequencies: { Poisson: [], Binomial: [], NegativeBinomial: [] },
          chiSquareValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0, criticalValue: 0 },
          pValues: { Poisson: 0, Binomial: 0, NegativeBinomial: 0 },
          degreesOfFreedom: 0,
          significanceLevel: 0.05,
          hypothesisAccepted: false,
          binLabels: [],
          meanCI: [],
          varianceCI: [],
        });

        hasAutoSave.current = false;
        autoSaveData.current = null;

        log('info', 'Автосохранение восстановлено', {
          component: 'AutoSave',
          dataLength: autoSaveData.current?.data?.length || 0
        });

      } catch (error) {
        log('error', 'Ошибка при восстановлении автосохранения', {
          component: 'AutoSave',
          error: error.message
        });
      }
    }
  };

  const dismissAutoSave = () => {
    hasAutoSave.current = false;
    autoSaveData.current = null;
    localStorage.removeItem('autoSave_defectAnalyzer');
    
    log('info', 'Автосохранение отклонено', {
      component: 'AutoSave'
    });
  };

  return {
    hasAutoSave: hasAutoSave.current,
    autoSaveData: autoSaveData.current,
    restoreAutoSave,
    dismissAutoSave
  };
};

export default AutoSave;