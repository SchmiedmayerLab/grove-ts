//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/**
 * Downloads provided file.
 */
export const downloadFile = (
  src: File | Blob | MediaSource,
  fileName: string,
) => {
  const url = URL.createObjectURL(src);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
};

/**
 * Converts base64 string to Blob.
 */
export const base64ToBlob = (
  base64Data: string,
  contentType = "",
  sliceSize = 512,
) => {
  const byteCharacters = atob(base64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    byteArrays.push(
      Uint8Array.from(slice, (character) => character.charCodeAt(0)),
    );
  }

  return new Blob(byteArrays, { type: contentType });
};
