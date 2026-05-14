import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/presentation/auth_controller.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authAsync = ref.watch(authProvider);
    final user = switch (authAsync.valueOrNull) {
      Authenticated(:final user) => user,
      _ => null,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(user == null ? 'MedApp' : 'Hi, ${user.fullName.split(' ').first}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {},
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _QuickAction(
            icon: Icons.calendar_today,
            title: 'Book an appointment',
            subtitle: 'Doctor, nurse, or hospital',
            onTap: () => context.go('/providers'),
          ),
          const SizedBox(height: 12),
          _QuickAction(
            icon: Icons.chat,
            title: 'Talk to the AI concierge',
            subtitle: 'Answers about care, scheduling, your record',
            onTap: () => context.go('/chat'),
          ),
          const SizedBox(height: 12),
          _QuickAction(
            icon: Icons.science_outlined,
            title: 'Upload a lab result',
            subtitle: 'Get plain-language explanation',
            onTap: () {},
          ),
          const SizedBox(height: 24),
          Text('Upcoming', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          const _EmptyCard(
            icon: Icons.event_busy,
            text: 'No upcoming appointments',
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Icon(icon)),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(icon, color: Theme.of(context).colorScheme.outline),
            const SizedBox(width: 12),
            Text(text, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
          ],
        ),
      ),
    );
  }
}
