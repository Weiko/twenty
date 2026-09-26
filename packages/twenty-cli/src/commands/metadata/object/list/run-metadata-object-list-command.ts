import { readBooleanOption } from '@/catalog/read-command-values';
import { type CommandRun } from '@/catalog/types/command-run.type';
import { type TargetCommandContext } from '@/catalog/types/target-command-context.type';
import { formatMetadataOwner } from '@/metadata/format-metadata-owner';
import { METADATA_OWNER_KIND_ORDER } from '@/metadata/constants/metadata-owner-kind-order.constant';
import { createMetadataOwnerResolver } from '@/metadata/resolve-metadata-owner';
import { formatTable } from '@/output/format-table';
import { dimText } from '@/output/style';
import { createMetadataClient } from '@/transport/metadata/create-metadata-client';

const OBJECT_PAGE_SIZE = 1000;

const fetchObjectsAndOwners = ({
  target,
  signal,
}: Pick<TargetCommandContext, 'target' | 'signal'>) =>
  createMetadataClient({ target, signal }).query({
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
    findManyApplications: { id: true, name: true, universalIdentifier: true },
    currentWorkspace: { workspaceCustomApplicationId: true },
  });

export const runMetadataObjectListCommand: CommandRun<
  TargetCommandContext
> = async ({ options, output, target, signal }) => {
  const includeSystemObjects = readBooleanOption(options, 'all');
  const { objects, findManyApplications, currentWorkspace } =
    await fetchObjectsAndOwners({ target, signal });

  if (objects.pageInfo.hasNextPage === true) {
    output.warn({
      code: 'INCOMPLETE_LIST',
      message: `Only the first ${OBJECT_PAGE_SIZE} objects are listed.`,
    });
  }

  const resolveOwner = createMetadataOwnerResolver({
    applications: findManyApplications,
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
