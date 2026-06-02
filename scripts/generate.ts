import fs from 'node:fs';
import path from 'node:path';

import * as protobuf from 'protobufjs';

const projectRoot = process.cwd();
const protoDirectory = path.resolve(projectRoot, 'src/proto');
const typesOutputFile = path.resolve(projectRoot, 'src/types/generated/index.ts');
const schemasOutputFile = path.resolve(projectRoot, 'src/schemas/generated/index.ts');
const registryOutputFile = path.resolve(projectRoot, 'src/grpc/registry.ts');

type DefinitionMap = Record<string, string>;

interface EnumDefinition {
  name: string;
  fullName: string;
  symbolName: string;
  values: string[];
}

interface FieldDefinition {
  name: string;
  type: string;
  repeated: boolean;
  map: boolean;
  keyType: string | undefined;
  resolvedType: string | undefined;
  isEnum: boolean;
  isMessage: boolean;
}

interface MessageDefinition {
  name: string;
  fullName: string;
  symbolName: string;
  fields: FieldDefinition[];
}

interface MethodDefinition {
  methodName: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  requestFieldCount: number;
  eventName: string;
}

interface ServiceDefinition {
  packageName: string;
  serviceName: string;
  fullServiceName: string;
  methods: MethodDefinition[];
}

const ensureDirectory = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const walkDirectory = (directoryPath: string): string[] => {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return walkDirectory(absolutePath);
    }

    return absolutePath.endsWith('.proto') ? [absolutePath] : [];
  });
};

const toPascalCase = (value: string): string =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');

const normalizeFullName = (fullName: string): string => fullName.replace(/^\./, '');

const symbolNameFromFullName = (fullName: string): string =>
  normalizeFullName(fullName)
    .split('.')
    .map((segment) => toPascalCase(segment))
    .join('');

const scalarTypeMap: DefinitionMap = {
  double: 'number',
  float: 'number',
  int32: 'number',
  uint32: 'number',
  sint32: 'number',
  fixed32: 'number',
  sfixed32: 'number',
  int64: 'string',
  uint64: 'string',
  sint64: 'string',
  fixed64: 'string',
  sfixed64: 'string',
  bool: 'boolean',
  string: 'string',
  bytes: 'string'
};

const scalarSchemaMap: DefinitionMap = {
  double: 'z.number()',
  float: 'z.number()',
  int32: 'z.number().int()',
  uint32: 'z.number().int()',
  sint32: 'z.number().int()',
  fixed32: 'z.number().int()',
  sfixed32: 'z.number().int()',
  int64: 'z.string()',
  uint64: 'z.string()',
  sint64: 'z.string()',
  fixed64: 'z.string()',
  sfixed64: 'z.string()',
  bool: 'z.boolean()',
  string: 'z.string()',
  bytes: 'z.string()'
};

const renderTsFieldType = (field: FieldDefinition, symbolMap: Map<string, string>): string => {
  const baseType = field.isEnum || field.isMessage ? symbolMap.get(field.resolvedType ?? '') ?? 'unknown' : scalarTypeMap[field.type] ?? 'unknown';

  if (field.map) {
    return `Record<string, ${baseType}>`;
  }

  if (field.repeated) {
    return `${baseType}[]`;
  }

  return baseType;
};

const renderZodFieldSchema = (field: FieldDefinition, symbolMap: Map<string, string>): string => {
  const baseSchema =
    field.isEnum || field.isMessage
      ? `${symbolMap.get(field.resolvedType ?? '') ?? 'z.unknown()'}Schema`
      : scalarSchemaMap[field.type] ?? 'z.unknown()';

  if (field.map) {
    return `z.record(${baseSchema}).default({})`;
  }

  if (field.repeated) {
    return `z.array(${baseSchema}).default([])`;
  }

  return `${baseSchema}.optional()`;
};

const readProtoRoot = (protoFiles: string[]): protobuf.Root => {
  const root = new protobuf.Root();

  root.resolvePath = (origin, target) => {
    const baseDirectory = origin ? path.dirname(origin) : protoDirectory;
    const candidate = path.resolve(baseDirectory, target);

    if (fs.existsSync(candidate)) {
      return candidate;
    }

    return path.resolve(protoDirectory, target);
  };

  root.loadSync(protoFiles, { keepCase: false });
  root.resolveAll();
  return root;
};

const collectDefinitions = (root: protobuf.Root) => {
  const enums: EnumDefinition[] = [];
  const messages: MessageDefinition[] = [];
  const services: ServiceDefinition[] = [];
  const symbolMap = new Map<string, string>();

  root.nestedArray.forEach((item) => {
    const stack: protobuf.ReflectionObject[] = [item];

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      if (current instanceof protobuf.Enum) {
        const definition: EnumDefinition = {
          name: current.name,
          fullName: normalizeFullName(current.fullName),
          symbolName: symbolNameFromFullName(current.fullName),
          values: Object.keys(current.values)
        };

        symbolMap.set(definition.fullName, definition.symbolName);
        enums.push(definition);
      }

      if (current instanceof protobuf.Type) {
        const definition: MessageDefinition = {
          name: current.name,
          fullName: normalizeFullName(current.fullName),
          symbolName: symbolNameFromFullName(current.fullName),
          fields: current.fieldsArray.map((field) => ({
            name: field.name,
            type: field.type,
            repeated: field.repeated,
            map: field.map,
            keyType: field instanceof protobuf.MapField ? field.keyType : undefined,
            resolvedType:
              field.resolvedType instanceof protobuf.Type || field.resolvedType instanceof protobuf.Enum
                ? normalizeFullName(field.resolvedType.fullName)
                : undefined,
            isEnum: field.resolvedType instanceof protobuf.Enum,
            isMessage: field.resolvedType instanceof protobuf.Type
          }))
        };

        symbolMap.set(definition.fullName, definition.symbolName);
        messages.push(definition);
      }

      if (current instanceof protobuf.Service) {
        const packageName = normalizeFullName(current.fullName).split('.').slice(0, -1).join('.');
        const definition: ServiceDefinition = {
          packageName,
          serviceName: current.name,
          fullServiceName: normalizeFullName(current.fullName),
          methods: current.methodsArray.map((method) => ({
            methodName: method.name,
            requestType: normalizeFullName(method.resolvedRequestType?.fullName ?? method.requestType),
            responseType: normalizeFullName(method.resolvedResponseType?.fullName ?? method.responseType),
            requestStream: Boolean(method.requestStream),
            responseStream: Boolean(method.responseStream),
            requestFieldCount: method.resolvedRequestType?.fieldsArray.length ?? 0,
            eventName: `${current.name}.${method.name}`
          }))
        };

        services.push(definition);
      }

      if ('nestedArray' in current && Array.isArray(current.nestedArray)) {
        stack.push(...current.nestedArray);
      }
    }
  });

  enums.sort((left, right) => left.fullName.localeCompare(right.fullName));
  messages.sort((left, right) => left.fullName.localeCompare(right.fullName));
  services.sort((left, right) => left.fullServiceName.localeCompare(right.fullServiceName));

  return { enums, messages, services, symbolMap };
};

const renderTypesFile = (
  enums: EnumDefinition[],
  messages: MessageDefinition[],
  symbolMap: Map<string, string>,
): string => {
  const lines: string[] = [
    '// This file is auto-generated by scripts/generate.ts. Do not edit manually.',
    ''
  ];

  enums.forEach((enumDefinition) => {
    lines.push(
      `export type ${enumDefinition.symbolName} = ${enumDefinition.values.map((value) => `'${value}'`).join(' | ')};`,
      '',
    );
  });

  messages.forEach((message) => {
    lines.push(`export interface ${message.symbolName} {`);

    message.fields.forEach((field) => {
      const optionalFlag = field.repeated || field.map ? '' : '?';
      lines.push(`  ${field.name}${optionalFlag}: ${renderTsFieldType(field, symbolMap)};`);
    });

    lines.push('}', '');
  });

  return `${lines.join('\n')}\n`;
};

const renderSchemasFile = (
  enums: EnumDefinition[],
  messages: MessageDefinition[],
  symbolMap: Map<string, string>,
): string => {
  const lines: string[] = [
    '// This file is auto-generated by scripts/generate.ts. Do not edit manually.',
    "import { z } from 'zod';",
    ''
  ];

  enums.forEach((enumDefinition) => {
    lines.push(
      `export const ${enumDefinition.symbolName}Values = [${enumDefinition.values.map((value) => `'${value}'`).join(', ')}] as const;`,
      `export const ${enumDefinition.symbolName}Schema = z.enum(${enumDefinition.symbolName}Values);`,
      '',
    );
  });

  messages.forEach((message) => {
    lines.push(`export const ${message.symbolName}Schema = z.lazy(() =>`);
    lines.push('  z.object({');

    message.fields.forEach((field) => {
      lines.push(`    ${field.name}: ${renderZodFieldSchema(field, symbolMap)},`);
    });

    lines.push('  }),', ');', '');
  });

  lines.push('export const schemaRegistry: Record<string, z.ZodTypeAny> = {');

  messages.forEach((message) => {
    lines.push(`  '${message.fullName}': ${message.symbolName}Schema,`);
  });

  lines.push('};', '');

  return `${lines.join('\n')}\n`;
};

const renderRegistryFile = (protoFiles: string[], services: ServiceDefinition[]): string => {
  const relativeProtoFiles = protoFiles.map((filePath) => path.relative(projectRoot, filePath).replace(/\\/g, '/'));

  return `// This file is auto-generated by scripts/generate.ts. Do not edit manually.
export interface ProtoMethodRegistry {
  methodName: string;
  requestType: string;
  responseType: string;
  requestStream: boolean;
  responseStream: boolean;
  requestFieldCount: number;
  eventName: string;
}

export interface ProtoServiceRegistry {
  packageName: string;
  serviceName: string;
  fullServiceName: string;
  methods: readonly ProtoMethodRegistry[];
}

export const protoRegistry = {
  protoFiles: ${JSON.stringify(relativeProtoFiles, null, 2)},
  services: ${JSON.stringify(services, null, 2)},
  eventNames: ${JSON.stringify(services.flatMap((service) => service.methods.map((method) => method.eventName)), null, 2)}
} as const;
`;
};

const main = (): void => {
  if (!fs.existsSync(protoDirectory)) {
    throw new Error(`Proto directory does not exist: ${protoDirectory}`);
  }

  const protoFiles = walkDirectory(protoDirectory).sort();

  if (protoFiles.length === 0) {
    throw new Error(`No proto files found under ${protoDirectory}`);
  }

  const root = readProtoRoot(protoFiles);
  const { enums, messages, services, symbolMap } = collectDefinitions(root);

  ensureDirectory(typesOutputFile);
  ensureDirectory(schemasOutputFile);
  ensureDirectory(registryOutputFile);

  fs.writeFileSync(typesOutputFile, renderTypesFile(enums, messages, symbolMap), 'utf8');
  fs.writeFileSync(schemasOutputFile, renderSchemasFile(enums, messages, symbolMap), 'utf8');
  fs.writeFileSync(registryOutputFile, renderRegistryFile(protoFiles, services), 'utf8');

  process.stdout.write(`Generated ${messages.length} messages, ${enums.length} enums, and ${services.length} services.\n`);
};

main();