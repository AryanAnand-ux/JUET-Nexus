import React from "react";

export function FigmaLoginGraphic() {
  return (
    <div className="hidden lg:flex w-1/2 flex-col items-center justify-center relative overflow-hidden bg-figma-bg p-12">
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] opacity-90 blur-[2px]" />
      <div className="absolute top-[20%] right-[20%] w-[60px] h-[60px] rounded-full bg-gradient-to-br from-[#818CF8] to-[#C084FC] opacity-80" />
      <div className="absolute bottom-[20%] left-[10%] w-[30px] h-[30px] rounded-full bg-[#C7D2FE] opacity-70" />
      <div className="absolute bottom-[-5%] right-[10%] w-[250px] h-[250px] rounded-full bg-gradient-to-tl from-[#C7D2FE] to-[#F5F3FF] opacity-50 blur-[1px]" />

      {/* Main Skeleton Graphic Area */}
      <div className="relative z-10 flex flex-col items-center mt-10">
        <div className="relative flex justify-center items-center w-[300px] h-[300px] mb-8">
          <div className="absolute inset-0 bg-[#E0E7FF] rounded-full opacity-60"></div>
          {/* Mock skeleton shape using CSS */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Skull */}
            <div className="w-24 h-24 bg-[#F2F4F3] rounded-t-full rounded-b-[40px] shadow-sm relative overflow-hidden">
              <div className="absolute top-10 left-3 w-7 h-7 bg-[#2A1E35] rounded-full"></div>
              <div className="absolute top-10 right-3 w-7 h-7 bg-[#2A1E35] rounded-full"></div>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-4 h-5 bg-[#2A1E35]" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
              {/* Teeth */}
              <div className="absolute bottom-0 w-full flex justify-center gap-[2px] px-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-2 h-3 border border-[#D1D5DB] bg-[#F2F4F3] rounded-b-sm"></div>
                ))}
              </div>
            </div>
            {/* Ribs mock */}
            <div className="mt-2 flex flex-col items-center gap-2">
              <div className="w-32 h-3 border-4 border-[#F2F4F3] rounded-full"></div>
              <div className="w-36 h-3 border-4 border-[#F2F4F3] rounded-full"></div>
              <div className="w-40 h-3 border-4 border-[#F2F4F3] rounded-full"></div>
              <div className="w-36 h-3 border-4 border-[#F2F4F3] rounded-full"></div>
            </div>
            {/* Laptop mock */}
            <div className="mt-4 w-48 h-28 bg-[#E5E7EB] rounded-t-xl border border-gray-300 shadow-inner flex items-center justify-center z-20">
              <div className="w-8 h-8 bg-[#D1D5DB] rounded-full"></div>
            </div>
          </div>

          {/* Leaves */}
          <div className="absolute -bottom-8 -left-12 w-24 h-32 bg-[#3B82F6] rounded-t-[100px] rounded-bl-[100px] rounded-br-[10px] transform -rotate-45 z-0" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}></div>
          <div className="absolute -bottom-8 -right-12 w-24 h-32 bg-[#8B5CF6] rounded-t-[100px] rounded-br-[100px] rounded-bl-[10px] transform rotate-45 z-0" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}></div>
        </div>

        {/* Text */}
        <div className="text-center mt-12 px-8">
          <h2 className="text-3xl font-bold text-figma-maroon mb-3 font-nunito tracking-tight">
            WebKiosk Sucks?
          </h2>
          <p className="text-figma-maroon-dark font-medium text-lg font-nunito">
            I Got You.
          </p>
        </div>
      </div>
    </div>
  );
}
