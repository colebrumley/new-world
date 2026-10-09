import { boot } from './app/shell';
import './ui/style.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('missing #app');
boot(root);
