// Mock implementation of @xenova/transformers
const mockPipelineFunction = jest.fn().mockImplementation(async (text, opts) => {
  // Return mock embedding data (384 dimensions)
  const mockEmbedding = Array.from({ length: 384 }, (_, i) => Math.random() - 0.5);
  return {
    data: mockEmbedding
  };
});

const pipeline = jest.fn().mockResolvedValue(mockPipelineFunction);

module.exports = {
  pipeline,
  __esModule: true,
  default: { pipeline }
};