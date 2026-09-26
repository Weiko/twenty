import { type OutputConfiguration } from 'commander';

export const createCommanderOutputCapture = () => {
  const captured = { out: '', err: '' };

  const configuration: OutputConfiguration = {
    writeOut: (text) => {
      captured.out += text;
    },
    writeErr: (text) => {
      captured.err += text;
    },
    outputError: (text) => {
      captured.err += text;
    },
  };

  return { captured, configuration };
};
