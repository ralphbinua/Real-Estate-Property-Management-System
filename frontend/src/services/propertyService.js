import api from './api';

// Fetch all properties from the backend
export const fetchProperties = async () => {
  const response = await api.get('/properties');
  return response.data;
};

// Create a new property
export const createProperty = async (propertyData) => {
  const response = await api.post('/properties', propertyData);
  return response.data;
};