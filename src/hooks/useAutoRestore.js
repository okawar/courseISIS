import { useRef, useEffect } from 'react';
import { log } from '../utils/Logger';

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