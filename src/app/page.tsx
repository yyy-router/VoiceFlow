export default function Home() {
  return (
    <main className="flex h-screen flex-col bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-3">
        <h1 className="text-lg font-semibold">VoiceFlow Agent</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-gray-800 p-4">
          <p className="text-gray-500 text-sm">语音面板</p>
        </aside>
        <section className="flex-1 p-4 flex items-center justify-center">
          <p className="text-gray-500">请通过语音开始绘图</p>
        </section>
      </div>
    </main>
  );
}
