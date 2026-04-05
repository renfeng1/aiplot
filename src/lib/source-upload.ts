async function getResponseMessage(
  responseText: string,
  fallback: string,
): Promise<string> {
  try {
    const data = JSON.parse(responseText) as { error?: { message?: string } };
    return data?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function uploadSourceFile(options: {
  file: File;
  sourceId: string;
  onUploadProgress?: (event: { percentage: number }) => void;
  onProcessingStart?: () => void;
}) {
  const formData = new FormData();
  formData.append("file", options.file);
  formData.append("sourceId", options.sourceId);
  formData.append("filename", options.file.name);
  formData.append("mimeType", options.file.type || "application/octet-stream");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percentage = Math.min(
        95,
        Math.round((event.loaded / event.total) * 95),
      );
      options.onUploadProgress?.({ percentage });
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onUploadProgress?.({ percentage: 96 });
        options.onProcessingStart?.();
        resolve();
        return;
      }

      reject(
        new Error(
          await getResponseMessage(xhr.responseText, "Source extraction failed."),
        ),
      );
    };

    xhr.onerror = () => {
      reject(new Error("上传请求失败。"));
    };

    xhr.onabort = () => {
      reject(new Error("上传已取消。"));
    };

    xhr.send(formData);
  });
}
