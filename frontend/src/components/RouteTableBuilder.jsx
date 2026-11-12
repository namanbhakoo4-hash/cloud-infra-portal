
import React from 'react'

const createId = () =>
  `route_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

const createRoute = (targetType = 'internet_gateway') => ({
  id: createId(),
  destinationCidr: '0.0.0.0/0',
  targetType,
  targetId: ''
})

const createRouteTable = (type = 'custom') => ({
  id: createId(),
  name: type === 'public'
    ? 'Public Route Table'
    : type === 'private'
      ? 'Private Route Table'
      : 'Custom Route Table',
  type,
  routes: type === 'public'
    ? [createRoute('internet_gateway')]
    : type === 'private'
      ? [createRoute('nat_gateway')]
      : [],
  associatedSubnetKeys: []
})

const TARGET_TYPES = [
  { value: 'internet_gateway', label: 'Internet Gateway' },
  { value: 'nat_gateway', label: 'NAT Gateway' },
  { value: 'virtual_private_gateway', label: 'Virtual Private Gateway' },
  { value: 'vpc_peering', label: 'VPC Peering Connection' },
  { value: 'transit_gateway', label: 'Transit Gateway' },
  { value: 'network_interface', label: 'Network Interface' }
]

const EXTERNAL_TARGETS = [
  'virtual_private_gateway',
  'vpc_peering',
  'transit_gateway',
  'network_interface'
]

export default function RouteTableBuilder({
  routeTables = [],
  subnets = [],
  onChange,
  disabled = false
}) {
  const updateTables = (nextTables) => {
    if (!disabled && typeof onChange === 'function') {
      onChange(nextTables)
    }
  }

  const addTable = (type = 'custom') => {
    updateTables([...routeTables, createRouteTable(type)])
  }

  const updateTable = (tableId, changes) => {
    updateTables(
      routeTables.map((table) =>
        table.id === tableId ? { ...table, ...changes } : table
      )
    )
  }

  const removeTable = (tableId) => {
    updateTables(routeTables.filter((table) => table.id !== tableId))
  }

  const addRoute = (table) => {
    updateTable(table.id, {
      routes: [...(table.routes || []), createRoute()]
    })
  }

  const updateRoute = (table, routeId, changes) => {
    updateTable(table.id, {
      routes: (table.routes || []).map((route) =>
        route.id === routeId ? { ...route, ...changes } : route
      )
    })
  }

  const removeRoute = (table, routeId) => {
    updateTable(table.id, {
      routes: (table.routes || []).filter(
        (route) => route.id !== routeId
      )
    })
  }

  const toggleSubnet = (table, subnetKey) => {
    const current = table.associatedSubnetKeys || []
    const next = current.includes(subnetKey)
      ? current.filter((key) => key !== subnetKey)
      : [...current, subnetKey]

    updateTable(table.id, { associatedSubnetKeys: next })
  }

  return (
    <section className="route-builder">
      <div className="route-builder-header">
        <div>
          <h3>Route Table Configuration</h3>
          <p>
            Create route tables, define network routes and associate
            your subnets.
          </p>
        </div>
      </div>

      <div className="route-builder-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => addTable('public')}
        >
          + Public Template
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => addTable('private')}
        >
          + Private Template
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => addTable('custom')}
        >
          + Blank Route Table
        </button>
      </div>

      <div className="route-builder-local-info">
        <strong>Local VPC Route</strong>
        <span>
          AWS automatically creates the local route for communication
          within the VPC. It cannot be removed here.
        </span>
      </div>

      {routeTables.length === 0 && (
        <div className="route-builder-empty">
          <strong>No route tables configured</strong>
          <p>
            Start with a Public or Private template, or create a blank
            route table.
          </p>
        </div>
      )}

      <div className="route-builder-list">
        {routeTables.map((table, tableIndex) => (
          <div className="route-builder-card" key={table.id}>
            <div className="route-builder-card-header">
              <div>
                <span className="route-builder-index">
                  ROUTE TABLE {tableIndex + 1}
                </span>
                <h4>{table.name || 'Unnamed Route Table'}</h4>
              </div>

              <button
                type="button"
                className="route-builder-remove"
                disabled={disabled}
                onClick={() => removeTable(table.id)}
              >
                Remove
              </button>
            </div>

            <div className="route-builder-grid">
              <label>
                Route Table Name
                <input
                  type="text"
                  value={table.name || ''}
                  disabled={disabled}
                  placeholder="Enter route table name"
                  onChange={(event) =>
                    updateTable(table.id, { name: event.target.value })
                  }
                />
              </label>

              <label>
                Template
                <select
                  value={table.type || 'custom'}
                  disabled={disabled}
                  onChange={(event) =>
                    updateTable(table.id, { type: event.target.value })
                  }
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
            </div>

            <div className="route-builder-subheading">
              <div>
                <h5>Routes</h5>
                <p>Define where network traffic should go.</p>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => addRoute(table)}
              >
                + Add Route
              </button>
            </div>

            {(table.routes || []).length === 0 && (
              <p className="route-builder-hint">
                No custom routes added yet.
              </p>
            )}

            {(table.routes || []).map((route, routeIndex) => (
              <div className="route-builder-route" key={route.id}>
                <div className="route-builder-route-title">
                  <strong>Route {routeIndex + 1}</strong>

                  <button
                    type="button"
                    className="route-builder-remove"
                    disabled={disabled}
                    onClick={() => removeRoute(table, route.id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="route-builder-grid">
                  <label>
                    Destination CIDR
                    <input
                      type="text"
                      value={route.destinationCidr || ''}
                      disabled={disabled}
                      placeholder="0.0.0.0/0"
                      onChange={(event) =>
                        updateRoute(table, route.id, {
                          destinationCidr: event.target.value
                        })
                      }
                    />
                  </label>

                  <label>
                    Target Type
                    <select
                      value={route.targetType || 'internet_gateway'}
                      disabled={disabled}
                      onChange={(event) =>
                        updateRoute(table, route.id, {
                          targetType: event.target.value,
                          targetId: ''
                        })
                      }
                    >
                      {TARGET_TYPES.map((target) => (
                        <option
                          key={target.value}
                          value={target.value}
                        >
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {EXTERNAL_TARGETS.includes(route.targetType) && (
                  <label className="route-builder-target-id">
                    Existing Target Resource ID
                    <input
                      type="text"
                      value={route.targetId || ''}
                      disabled={disabled}
                      placeholder={
                        route.targetType === 'virtual_private_gateway'
                          ? 'vgw-0123456789abcdef0'
                          : route.targetType === 'vpc_peering'
                            ? 'pcx-0123456789abcdef0'
                            : route.targetType === 'transit_gateway'
                              ? 'tgw-0123456789abcdef0'
                              : 'eni-0123456789abcdef0'
                      }
                      onChange={(event) =>
                        updateRoute(table, route.id, {
                          targetId: event.target.value
                        })
                      }
                    />
                  </label>
                )}

                {(route.targetType === 'internet_gateway' ||
                  route.targetType === 'nat_gateway') && (
                  <p className="route-builder-auto-note">
                    This resource will be generated automatically when
                    the route table is processed.
                  </p>
                )}
              </div>
            ))}

            <div className="route-builder-subheading">
              <div>
                <h5>Subnet Associations</h5>
                <p>
                  Select which subnets should use this route table.
                </p>
              </div>
            </div>

            {subnets.length === 0 ? (
              <p className="route-builder-hint">
                Configure subnets before associating them with a route
                table.
              </p>
            ) : (
              <div className="route-builder-subnets">
                {subnets.map((subnet, subnetIndex) => (
                  <label
                    className="route-builder-subnet"
                    key={subnet.resourceKey || subnetIndex}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={(table.associatedSubnetKeys || []).includes(
                        subnet.resourceKey
                      )}
                      onChange={() =>
                        toggleSubnet(table, subnet.resourceKey)
                      }
                    />

                    <span>
                      <strong>
                        {subnet.name || `Subnet ${subnetIndex + 1}`}
                      </strong>
                      <small>
                        {(subnet.subnetType || 'private').toUpperCase()}
                        {subnet.ipv4Cidr ? ` · ${subnet.ipv4Cidr}` : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
