import { readBooleanOption } from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { formatMetadataOwner } from '@/metadata/format-metadata-owner';
import { METADATA_OWNER_KIND_ORDER } from '@/metadata/constants/metadata-owner-kind-order.constant';
import { createMetadataOwnerResolver } from '@/metadata/resolve-metadata-owner';
import { CliError } from '@/output/cli-error';
import { formatTable } from '@/output/format-table';
import { dimText } from '@/output/style';
import { createMetadataClient } from '@/transport/metadata/create-metadata-client';

const OBJECT_PAGE_SIZE = 1000;

type MetadataClient = ReturnType<typeof createMetadataClient>;

const fetchObjects = (client: MetadataClient) =>
  client.query({
    objects: {
      __args: { paging: { first: OBJECT_PAGE_SIZE }, filter: {} },
      pageInfo: { hasNextPage: true },
      edges: {
        node: {
          nameSingular: true,
          namePlural: true,
          labelSingular: true,
          labelPlural: true,
          isSystem: true,
          isActive: true,
          applicationId: true,
        },
      },
    },
    currentWorkspace: { workspaceCustomApplicationId: true },
  });

const fetchOwnerApplications = async (client: MetadataClient) => {
  try {
    const { findManyApplications } = await client.query({
      findManyApplications: { id: true, name: true, universalIdentifier: true },
    });

    return { applications: findManyApplications, areOwnersNamed: true };
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== 'PERMISSION_DENIED') {
      throw error;
    }

    return { applications: [], areOwnersNamed: false };
  }
};

export const runMetadataObjectListCommand: CommandRun<
  TargetCommandContext
> = async ({ options, output, target, signal }) => {
  const includeSystemObjects = readBooleanOption(options, 'all');
  const client = createMetadataClient({ target, signal });
  const [{ objects, currentWorkspace }, { applications, areOwnersNamed }] =
    await Promise.all([fetchObjects(client), fetchOwnerApplications(client)]);

  if (objects.pageInfo.hasNextPage === true) {
    output.warn({
      code: 'INCOMPLETE_LIST',
      message: `Only the first ${OBJECT_PAGE_SIZE} objects are listed.`,
    });
  }

  if (!areOwnersNamed) {
    output.warn({
      code: 'OWNERS_UNAVAILABLE',
      message:
        'Owners other than Custom show as unknown: listing apps needs the Applications permission.',
    });
  }

  const resolveOwner = createMetadataOwnerResolver({
    applications,
    workspaceCustomApplicationId: currentWorkspace.workspaceCustomApplicationId,
  });
  const allObjects = objects.edges.map(
    ({ node: { applicationId, ...object } }) => ({
      ...object,
      owner: resolveOwner(applicationId),
    }),
  );
  const listedObjects = allObjects
    .filter((object) => includeSystemObjects || !object.isSystem)
    .sort(
      (first, second) =>
        METADATA_OWNER_KIND_ORDER.indexOf(first.owner.kind) -
          METADATA_OWNER_KIND_ORDER.indexOf(second.owner.kind) ||
        first.namePlural.localeCompare(second.namePlural),
    );
  const hiddenSystemObjectCount = allObjects.length - listedObjects.length;

  return {
    data: { objects: listedObjects, hiddenSystemObjectCount },
    human: [
      formatTable({
        rows: listedObjects,
        columns: [
          { header: 'API NAME', value: (object) => object.namePlural },
          {
            header: 'LABEL',
            value: (object) =>
              object.isActive
                ? object.labelPlural
                : `${object.labelPlural} ${dimText('(inactive)')}`,
          },
          {
            header: 'OWNER',
            value: (object) => formatMetadataOwner(object.owner),
          },
        ],
      }),
      dimText(
        hiddenSystemObjectCount > 0
          ? `${listedObjects.length} objects · ${hiddenSystemObjectCount} system objects hidden, show them with --all`
          : `${listedObjects.length} objects`,
      ),
    ].join('\n'),
  };
};
