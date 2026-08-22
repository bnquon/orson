import { IconoirProvider } from 'iconoir-react';
import { WorkbenchPage } from './features/workbench/WorkbenchPage';

function App() {
  return (
    <IconoirProvider iconProps={{ width: 18, height: 18, strokeWidth: 1.5 }}>
      <WorkbenchPage />
    </IconoirProvider>
  );
}

export default App;
