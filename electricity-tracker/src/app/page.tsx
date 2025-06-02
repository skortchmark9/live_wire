import ElectricityDashboard from '@/components/ElectricityDashboard'

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Electricity Usage Dashboard</h1>
      <ElectricityDashboard />
    </main>
  )
}
