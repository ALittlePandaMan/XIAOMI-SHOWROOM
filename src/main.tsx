import React from 'react';
import { createRoot } from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import ShowroomRoutes from './ShowroomRoutes';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><ShowroomRoutes/></BrowserRouter></React.StrictMode>);
