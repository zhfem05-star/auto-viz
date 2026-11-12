import { useQuery } from '@tanstack/react-query'
import { api } from './client'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/health')
      if (error || !data) throw new Error('API 응답 없음')
      return data
    },
    refetchInterval: 30_000,
    retry: false,
  })
}
