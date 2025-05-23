import React from 'react'
import { Button } from '@mui/material'
import * as XLSX from 'xlsx'

const FileUploader = ({ setData, data, analysis }) => {
  const handleFile = (e) => {
    const file = e.target.files[0]
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)
        
        // Валидация загруженных данных
        const isValid = jsonData.every(row => {
          const total = Number(row.total);
          const defects = Number(row.defects);
          return !isNaN(total) && !isNaN(defects) && total >= 0 && defects >= 0 && defects <= total;
        });
        
        if (!isValid) {
          console.error('Ошибка: загружены некорректные данные')
          alert('Ошибка: файл содержит некорректные данные (отрицательные значения или defects > total)')
          return
        }
        
        if (jsonData.length === 0) {
          console.error('Ошибка: файл пуст')
          alert('Ошибка: файл пуст')
          return
        }
        
        setData(jsonData)
      } catch (error) {
        console.error('Ошибка загрузки файла:', error)
        alert('Ошибка при загрузке файла')
      }
    }

    reader.readAsArrayBuffer(file)
  }

  const handleSaveProject = () => {
    const project = { data, analysis }
    localStorage.setItem('defectAnalyzerProject', JSON.stringify(project))
    alert('Проект сохранен!')
  }

  const handleLoadProject = () => {
    const project = localStorage.getItem('defectAnalyzerProject')
    if (project) {
      const { data, analysis } = JSON.parse(project)
      setData(data)
      alert('Проект загружен!')
    } else {
      alert('Сохраненный проект не найден!')
    }
  }

  return (
    <div className="flex gap-4 flex-col">
      <Button
        variant="contained"
        component="label"
        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg"
      >
        Загрузить файл
        <input type="file" hidden onChange={handleFile} accept=".xlsx,.xls,.csv" />
      </Button>
      <Button
        variant="contained"
        onClick={handleSaveProject}
        className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg"
      >
        Сохранить проект
      </Button>
      <Button
        variant="contained"
        onClick={handleLoadProject}
        className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg"
      >
        Загрузить проект
      </Button>
    </div>
  )
}

export default FileUploader