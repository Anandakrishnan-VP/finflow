import axios from 'axios';

const apiClient  = axios.create({ baseURL: '/api' });
const authClient = axios.create({ baseURL: '/auth' });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let refreshQueue = [];

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config._retried) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => refreshQueue.push({ resolve, reject, config }));
      }
      config._retried = true;
      isRefreshing = true;
      try {
        const refresh_token = localStorage.getItem('refresh_token');
        const { data } = await authClient.post('/refresh', null, { params: { refresh_token } });
        localStorage.setItem('access_token', data.access_token);
        refreshQueue.forEach(({ resolve, config: c }) => {
          c.headers.Authorization = `Bearer ${data.access_token}`;
          resolve(apiClient(c));
        });
        refreshQueue = [];
        config.headers.Authorization = `Bearer ${data.access_token}`;
        return apiClient(config);
      } catch (refreshError) {
        refreshQueue.forEach(({ reject: rej }) => rej(refreshError));
        refreshQueue = [];
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export { apiClient, authClient };
