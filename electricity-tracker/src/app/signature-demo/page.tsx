'use client';

import { useState } from 'react';
import SignatureCanvas from '@/components/documents/SignatureCanvas';

export default function SignatureDemoPage() {
  const [signature, setSignature] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Signature Canvas Demo
          </h1>
          <p className="text-gray-600">
            Testing the SignatureCanvas component for vertical offset issues
          </p>
        </div>

        {/* Demo Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Signature Canvas</h2>
          
          <div className="border-2 border-red-300 p-4 mb-4">
            <p className="text-sm text-red-600 mb-2">Red border container to visualize positioning</p>
            <SignatureCanvas
              onSignatureChange={setSignature}
              className="w-full"
            />
          </div>

          {signature && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-900 mb-2">Captured Signature:</h3>
              <div className="border border-gray-300 rounded p-2">
                <img src={signature} alt="Signature" className="max-w-full" />
              </div>
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Debug Notes:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Check if the drawing position matches cursor/finger position</li>
            <li>• Red border shows the container boundaries</li>
            <li>• Canvas should be 400x150 pixels but responsive width</li>
            <li>• Look for getBoundingClientRect() offset calculations</li>
          </ul>
        </div>
      </div>
    </div>
  );
}