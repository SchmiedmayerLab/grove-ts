//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

/** Raw, form-decoded, and recursively percent-decoded string representations. */
const decodedStringRepresentations = (value: string): readonly string[] => {
  const representations = new Set([value])
  let decoded = value
  for (let layer = 0; layer <= value.length; layer += 1) {
    const formDecoded = decoded.replaceAll('+', ' ')
    representations.add(formDecoded)
    let next: string
    try {
      next = decodeURIComponent(formDecoded)
    } catch {
      break
    }
    representations.add(next)
    if (next === decoded || next === formDecoded) break
    decoded = next
  }
  return [...representations]
}

export const containsReversibleIdentityRepresentation = (
  emitted: string,
  privateValue: string,
): boolean => {
  const privateRepresentations = decodedStringRepresentations(privateValue)
  return decodedStringRepresentations(emitted).some((emittedValue) =>
    privateRepresentations.some(
      (privateRepresentation) =>
        privateRepresentation !== '' &&
        emittedValue.includes(privateRepresentation),
    ),
  )
}
