import './App.css'
import React from 'react'
import { Container, Typography, Box } from '@mui/material'
import Dashboard from './pages/Dashboard.jsx'

function App() {
  return (
    <div className="App min-h-screen bg-gray-100 flex flex-col items-center justify-center">
      <Container className="bg-white rounded-lg shadow-lg p-6">
        <Box my={4} className="text-center">

          <Dashboard className="flex"/>
        </Box>
      </Container>
    </div>
  )
}

export default App