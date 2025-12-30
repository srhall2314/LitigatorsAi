import { NextRequest, NextResponse } from 'next/server';
import { uploadBlob } from '@/lib/blob';
import { requireAuth, handleApiError } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await requireAuth(request);
    if (authResult.error) return authResult.error;
    
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const blob = await uploadBlob(file.name, buffer, {
      contentType: file.type,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (error) {
    logger.error('Upload error', error, 'UploadRoute');
    return handleApiError(error, 'UploadRoute');
  }
}

