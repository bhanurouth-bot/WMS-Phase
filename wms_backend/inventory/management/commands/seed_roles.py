from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission, User

class Command(BaseCommand):
    help = 'Seeds initial user groups (Admins, Managers, Pickers, Audit) with permissions.'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding User Groups and Permissions...')

        # 1. Define Groups
        groups = {
            'Admins': '__all__', # Special flag for all permissions
            
            'Managers': [
                # Can manage core business objects
                'add_item', 'change_item', 'view_item',
                'add_location', 'change_location', 'view_location',
                'add_supplier', 'change_supplier', 'view_supplier',
                'add_user', 'change_user', 'view_user', 'delete_user',
                # Operations
                'view_inventory', 'change_inventory',
                'view_order', 'change_order', 'add_order',
                'view_purchaseorder', 'add_purchaseorder', 'change_purchaseorder',
                'view_rma', 'change_rma',
                'view_transactionlog',
            ],
            
            'Pickers': [
                # Can see what to pick and where
                'view_item',
                'view_location',
                'view_inventory',
                # Can interact with orders (picking)
                'view_order', 'change_order',
                'view_orderline', 'change_orderline',
                'view_pickbatch', 'change_pickbatch',
            ],
            
            'Audit': [
                # Read-only access to most things
                'view_item', 'view_location', 'view_inventory', 
                'view_order', 'view_transactionlog',
                # Can manage counts
                'add_cyclecountsession', 'change_cyclecountsession', 'view_cyclecountsession',
                'add_cyclecounttask', 'change_cyclecounttask', 'view_cyclecounttask',
            ]
        }

        for group_name, perms in groups.items():
            group, created = Group.objects.get_or_create(name=group_name)
            if created:
                self.stdout.write(f'Created group: {group_name}')
            
            # Clear existing to reset
            group.permissions.clear()

            if perms == '__all__':
                # Admins get all permissions
                for p in Permission.objects.all():
                    group.permissions.add(p)
            else:
                for codename in perms:
                    try:
                        permission = Permission.objects.get(codename=codename)
                        group.permissions.add(permission)
                    except Permission.DoesNotExist:
                        self.stdout.write(self.style.WARNING(f'Warning: Permission {codename} not found.'))
            
            self.stdout.write(f'Updated permissions for {group_name}')

        # 2. Add Superusers to "Admins" automatically
        for user in User.objects.filter(is_superuser=True):
            admin_group = Group.objects.get(name='Admins')
            user.groups.add(admin_group)
            self.stdout.write(f'Added superuser {user.username} to Admins group')

        self.stdout.write(self.style.SUCCESS('Successfully seeded roles.'))