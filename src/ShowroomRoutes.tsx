import {Navigate,Route,Routes,useLocation} from 'react-router-dom';
import App from './App';

function DefaultShowroomRoute(){
 const {search,hash}=useLocation();
 return <Navigate replace to={{pathname:'/exterior',search,hash}}/>;
}

export default function ShowroomRoutes(){
 // The parent owns the canvas so route changes preserve its WebGL context and animations.
 return <Routes>
  <Route path="/" element={<App/>}>
   <Route index element={<DefaultShowroomRoute/>}/>
   <Route path="exterior" element={null}/>
   <Route path="interior" element={null}/>
   <Route path="*" element={<DefaultShowroomRoute/>}/>
  </Route>
 </Routes>;
}
