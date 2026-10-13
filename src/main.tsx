import React from 'react';
import { createRoot } from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import ShowroomRoutes from './ShowroomRoutes';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><ShowroomRoutes/></BrowserRouter></React.StrictMode>);
