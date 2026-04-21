import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

export const apiService = {
  getTrenchScopeToken: (address) => api.get('/trenchscope/token', { params: { address } }),
  getTrenchScopeWallet: (wallet) => api.get('/trenchscope/wallet', { params: { wallet } }),
  getTrenchScopeTrending: () => api.get('/trenchscope/trending'),
  getTrenchScopeUsage: () => api.get('/trenchscope/usage'),
};

export default apiService;
