import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { createRepositories } from '../../data/repositories';
import { createApplicationServices, type ApplicationServices } from './services';

const ApplicationContext = createContext<ApplicationServices | null>(null);
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const services = useMemo(() => createApplicationServices(createRepositories(db)), [db]);
  return <ApplicationContext.Provider value={services}>{children}</ApplicationContext.Provider>;
}
export function useApplication(): ApplicationServices {
  const services = useContext(ApplicationContext);
  if (!services) throw new Error('ApplicationProvider is missing.');
  return services;
}
