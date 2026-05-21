"use client";

import Link from "next/link";
import { useState } from "react";

const FAQ_DATA = [
  {
    category: "General",
    q: "How does the AI choose which parts to clip?",
    a: "Our AI scans for high-engagement indicators like faces, strong emotions, laughter, and high-energy pacing, as well as transcript keywords. It perfectly frames the action and cuts at the right moments."
  },
  {
    category: "General",
    q: "Can I edit the clips before exporting?",
    a: "Yes! You can adjust the start and end times, choose different caption styles, and preview everything before rendering the final export."
  },
  {
    category: "Pricing",
    q: "Is there a free tier?",
    a: "We offer a generous free tier which allows you to process up to 3 long videos per month and export 10 clips with watermarks. You can upgrade for unlimited HD exports."
  },
  {
    category: "Tech",
    q: "What video platforms do you support?",
    a: "You can upload standard video files (MP4, MOV) or simply paste a YouTube URL – we handle the rest automatically."
  }
];

export default function LandingPage() {
  const [faqsOpen, setFaqsOpen] = useState<Record<number, boolean>>({});

  const toggleFaq = (index: number) => {
    setFaqsOpen((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#020617] text-slate-900 dark:text-slate-50 font-sans mt-0 transition-colors duration-300">
      
      {/* ──── HERO ──── */}
      <section id="home" className="pt-16 pb-24 lg:pt-24 lg:pb-32 px-6 md:px-12 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16 relative">
        <div className="flex-1 text-left space-y-8 z-10 relative">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 font-medium text-sm mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            MagnumClips AI Editor v2.0
          </div>
          <h1 className="text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.05] text-slate-900 dark:text-white tracking-tight">
            Turn Long Videos Into <span className="text-blue-600 dark:text-blue-500">Viral Clips.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
            Upload your podcast or stream and our AI will automatically find the best moments, crop the active speaker, and render captions.
          </p>
          
          <div className="flex flex-wrap gap-4 pt-4">
            <Link href="/signup" className="px-8 py-3.5 rounded-full bg-slate-900 dark:bg-blue-600 text-white text-lg font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors shadow-lg dark:shadow-blue-900/20 hover:shadow-xl hover:-translate-y-0.5 duration-200">
              Get Started Free
            </Link>
            <button onClick={() => scrollToSection('how-it-works')} className="px-8 py-3.5 rounded-full border-2 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-lg font-semibold hover:border-slate-300 dark:hover:border-slate-700 transition-colors bg-white dark:bg-slate-900">
              See How It Works
            </button>
          </div>
        </div>
        
        <div className="flex-1 w-full max-w-2xl relative">
          {/* Subtle background glow behind the hero graphic in dark mode */}
          <div className="absolute inset-0 bg-blue-600/10 dark:bg-blue-600/20 blur-[100px] rounded-full z-0" />
          
          <div className="aspect-[4/3] lg:aspect-[1/1] xl:aspect-[4/3] w-full bg-slate-50 dark:bg-[#0a0f1d] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col relative group z-10">
            {/* Abstract Grid Background */}
            <div className="absolute inset-0 z-0">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            </div>

            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8">
              
              {/* Base Video */}
              <div className="w-full max-w-sm h-40 bg-slate-800 dark:bg-slate-900 rounded-xl shadow-2xl relative overflow-hidden flex items-center justify-center transform transition-transform duration-500 group-hover:scale-105 border border-slate-700 dark:border-slate-700">
                  <div className="absolute top-2 left-3 flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-yellow-600"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 border border-green-600"></div>
                  </div>
                  <svg className="w-12 h-12 text-slate-500 dark:text-slate-600 transition-colors duration-500 hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {/* Timeline Scanner Effect */}
                  <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-500/90 shadow-[0_0_25px_rgba(59,130,246,1)] animate-[scan-line_4s_ease-in-out_infinite]" />
              </div>

              {/* Connecting Split */}
              <div className="h-12 border-l-2 border-dashed border-blue-300 dark:border-slate-700 my-2 relative">
                 <div className="absolute top-1/2 -ml-[13px] mt-[-10px] bg-blue-100 dark:bg-slate-800 rounded-full p-1 text-blue-600 dark:text-blue-400 animate-bounce">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                 </div>
              </div>

              {/* 3 Outputs */}
              <div className="flex gap-4">
                 {[98, 92, 85].map((score, i) => (
                    <div key={i} className="w-24 h-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg dark:shadow-none border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden relative transform transition-transform hover:-translate-y-2 duration-300 opacity-0 animate-[fade-in-up_0.8s_ease-out_forwards]" style={{ animationDelay: `${i * 300 + 400}ms` }}>
                       <div className="h-full bg-slate-100 dark:bg-slate-900/50 flex items-center justify-center flex-col">
                          <svg className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-2" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17 10.5V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3.5l4 4v-11l-4 4z" />
                          </svg>
                       </div>
                       {/* Floating Caption Mocks */}
                       <div className="absolute bottom-4 left-0 w-full flex flex-col items-center gap-1.5 z-10 px-2 animate-[float-caption_3s_ease-in-out_infinite]" style={{ animationDelay: `${i * 200}ms` }}>
                           <div className="h-3 bg-blue-500 dark:bg-blue-600 rounded-full w-full" />
                           <div className="h-3 bg-slate-800 dark:bg-slate-400 rounded-full w-3/4" />
                       </div>
                       {/* Viral Score Badge */}
                       <div className="absolute top-2 right-2 w-7 h-7 bg-green-500 dark:bg-emerald-600 rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center text-[10px] font-bold text-white shadow-md opacity-0 animate-[pulse-in_0.5s_ease-out_forwards]" style={{ animationDelay: `${i * 300 + 1200}ms` }}>
                         {score}
                       </div>
                    </div>
                 ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──── STATS TAPE ──── */}
      <section className="border-y border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-wrap justify-between md:justify-around items-center gap-8">
           <div className="text-center">
              <div className="text-4xl font-extrabold text-blue-600 dark:text-blue-500">10x</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Faster Editing</div>
           </div>
           <div className="text-center">
              <div className="text-4xl font-extrabold text-blue-600 dark:text-blue-500">95%</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Time Saved</div>
           </div>
           <div className="text-center">
              <div className="text-4xl font-extrabold text-blue-600 dark:text-blue-500">3</div>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Export Formats</div>
           </div>
        </div>
      </section>

      {/* ──── FEATURES ──── */}
      <section id="features" className="py-24 bg-white dark:bg-[#020617]">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">Core Features</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">Everything you need to automate your content pipeline and grow your audience.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                title: "AI Moment Detection",
                desc: "Our AI watches your video and automatically segments the most engaging parts based on speech, emotion, and pace.",
                icon: <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              },
              {
                title: "Smart Auto-Captions",
                desc: "Generate perfectly timed, dynamic captions with word-by-word highlights styled just like top creators.",
                icon: <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
              },
              {
                title: "Auto-Reframe",
                desc: "Transforms landscape videos into vertical 9:16 by intelligently tracking the active speaker's face.",
                icon: <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              }
            ].map((f, i) => (
              <div key={i} className="bg-white dark:bg-slate-900/40 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg dark:hover:shadow-none hover:border-slate-200 dark:hover:border-slate-700 hover:-translate-y-1 transition-all duration-300">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 flex items-center justify-center mb-6">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-3">{f.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-base">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──── ADVANCED AI FEATURES ──── */}
      <section className="py-12 md:py-24 bg-slate-50 dark:bg-[#020617] border-t border-slate-100 dark:border-slate-800/60 transition-colors">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8">
            
            {/* ClipAnything */}
            <div className="flex flex-col gap-6">
              <div className="bg-[#1c1a17] rounded-[2rem] aspect-[4/3] md:aspect-[3/2] lg:aspect-[4/3] relative overflow-hidden shadow-2xl border border-white/5 group">
                <img 
                  src="/clip_anything_ill.png" 
                  alt="ClipAnything Illustration" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">ClipAnything</h3>
                <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed mix-blend-luminosity">
                  Every other AI clipping tool only works with video podcasts. ClipAnything is the only AI clipping model that turns any genre — vlogs, gaming, sports, interviews, explainer videos — into viral clips in 1 click.
                </p>
              </div>
            </div>

            {/* ReframeAnything */}
            <div className="flex flex-col gap-6">
              <div className="bg-[#1c1a17] rounded-[2rem] aspect-[4/3] md:aspect-[3/2] lg:aspect-[4/3] relative overflow-hidden shadow-2xl border border-white/5 group">
                <img 
                  src="/reframe_anything_ill.png" 
                  alt="ReframeAnything Illustration" 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">ReframeAnything</h3>
                <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed mix-blend-luminosity">
                  The only AI reframe model that resizes any video for any platform and keeps moving subjects centered with AI object tracking. If you want more control, use manual tracking to instruct AI exactly what to follow.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ──── HOW IT WORKS ──── */}
      <section id="how-it-works" className="py-24 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">How It Works</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">Three simple steps to populate your content calendar.</p>
          </div>

          <div className="flex flex-col md:flex-row justify-between gap-12 relative z-0 mt-12">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-[44px] left-[10%] right-[10%] h-[2px] bg-slate-200 dark:bg-slate-800 -z-10" />

            {[
              {
                step: "1",
                title: "Upload or Link",
                desc: "Paste a YouTube link or drop your raw video file into the dashboard."
              },
              {
                step: "2",
                title: "AI Analysis",
                desc: "Our engine reviews footage, generating multiple high-potential clips."
              },
              {
                step: "3",
                title: "Tweak & Export",
                desc: "Adjust captions and timing if needed, then export your clips."
              }
            ].map((s, i) => (
              <div key={i} className="flex-1 text-center group z-10">
                <div className="w-24 h-24 mx-auto bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-3xl font-bold text-slate-800 dark:text-slate-100 mb-6 shadow-sm group-hover:scale-110 group-hover:border-blue-500 dark:group-hover:border-blue-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all duration-300">
                  {s.step}
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">{s.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto text-base">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ──── PRICING ──── */}
      <section id="pricing" className="py-24 bg-white dark:bg-[#020617] border-t border-slate-100 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">Start for free, upgrade when you need more power.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto pb-4">
            {/* Free Tier */}
            <div className="bg-white dark:bg-[#0a0f1d] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Starter</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Perfect to test the waters and grow.</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">$0</span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">/month</span>
              </div>
              <Link href="/signup" className="w-full block text-center py-3 rounded-full border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:border-slate-300 dark:hover:border-slate-600 transition-colors mb-8">
                Get Started Free
              </Link>
              <ul className="space-y-4 flex-1">
                {[
                  "3 Video Uploads / month",
                  "10 Clip Exports (Watermarked)",
                  "Standard 720p Resolution",
                  "Basic Auto-Captions"
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro Tier (Popular) */}
            <div className="bg-slate-900 dark:bg-blue-900/20 p-8 rounded-3xl border-2 border-blue-600 dark:border-blue-500 shadow-xl flex flex-col relative transform md:-translate-y-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Pro</h3>
              <p className="text-slate-300 dark:text-blue-200 mb-6">For creators serious about growth.</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-white">$5</span>
                <span className="text-slate-400 dark:text-blue-300 font-medium">/month</span>
              </div>
              <Link href="/signup" className="w-full block text-center py-3 rounded-full bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors mb-8 shadow-lg shadow-blue-900/20">
                Start Pro Trial
              </Link>
              <ul className="space-y-4 flex-1">
                {[
                  "30 Video Uploads / month",
                  "Unlimited Clip Exports",
                  "1080p HD Resolution",
                  "No Watermarks",
                  "Custom Branding & Fonts",
                  "Priority Support"
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-slate-300 dark:text-blue-100">
                    <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Scale Tier */}
            <div className="bg-white dark:bg-[#0a0f1d] p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Agency</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">For teams managing multiple channels.</p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">$20</span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">/month</span>
              </div>
              <Link href="/signup" className="w-full block text-center py-3 rounded-full border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:border-slate-300 dark:hover:border-slate-600 transition-colors mb-8">
                Get Agency
              </Link>
              <ul className="space-y-4 flex-1">
                {[
                  "Unlimited Video Uploads",
                  "Unlimited Clip Exports",
                  "4K Ultra HD Export",
                  "Team Collaboration",
                  "API Access",
                  "Dedicated Account Manager"
                ].map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ──── FAQ ──── */}
      <section id="faq" className="py-24 bg-white dark:bg-[#020617] border-y border-slate-100 dark:border-slate-800/60">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">Got questions? We've got answers.</p>
          </div>

          <div className="space-y-4">
            {FAQ_DATA.map((faq, i) => (
              <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-slate-700 transition-all">
                <button 
                  onClick={() => toggleFaq(i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
                >
                  <span className="text-lg font-semibold text-slate-800 dark:text-slate-200">{faq.q}</span>
                  <svg 
                    className={`w-6 h-6 text-slate-400 dark:text-slate-500 transform transition-transform duration-200 ${faqsOpen[i] ? "rotate-180" : ""}`} 
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${faqsOpen[i] ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
                >
                  <p className="px-6 pb-6 text-slate-500 dark:text-slate-400">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──── OUTRO / CTA ──── */}
      <section className="py-24 text-center px-6 bg-slate-50 dark:bg-[#020617]">
        <div className="bg-slate-900 dark:bg-gradient-to-br dark:from-blue-900 dark:to-[#020617] text-white rounded-3xl max-w-5xl mx-auto p-12 md:p-24 shadow-2xl dark:shadow-none dark:border dark:border-blue-800/50 relative overflow-hidden">
          {/* subtle pattern overlay */}
          <div className="absolute inset-0 opacity-10 dark:opacity-5" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\' fill=\'%23ffffff\' fill-opacity=\'1\' fill-rule=\'nonzero\'/%3E%3C/g%3E%3C/svg%3E")' }} />
          
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">Ready to scale your reach?</h2>
            <p className="text-xl text-slate-300 dark:text-blue-200 mb-10 max-w-2xl mx-auto">Join thousands of creators using MagnumClips to generate months of content in mere minutes.</p>
            <Link href="/signup" className="inline-block px-10 py-4 rounded-full bg-white dark:bg-blue-600 text-slate-900 dark:text-white text-lg font-bold hover:bg-slate-100 dark:hover:bg-blue-500 transition-colors shadow-xl">
              Start Creating for Free
            </Link>
            <p className="mt-6 text-sm text-slate-400 dark:text-blue-300/60">No credit card required to start.</p>
          </div>
        </div>
      </section>

      {/* ──── FOOTER ──── */}
      <footer className="border-t border-slate-200 dark:border-slate-800/60 py-12 bg-white dark:bg-[#020617]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-2xl font-serif font-bold text-slate-800 dark:text-slate-200">MagnumClips</div>
          
          <div className="flex gap-8 text-sm font-medium text-slate-500 dark:text-slate-400">
            <Link href="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Terms of Service</Link>
            <Link href="/contact" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Contact</Link>
          </div>

          <p className="text-sm text-slate-400 dark:text-slate-600">© 2026 MagnumClips. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
