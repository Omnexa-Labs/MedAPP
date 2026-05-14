import 'package:flutter/material.dart';

class ProvidersScreen extends StatelessWidget {
  const ProvidersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Find care')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          _ProviderTile(name: 'Dr. Aisha Mensah', specialty: 'Cardiology', rating: 4.8),
          _ProviderTile(name: 'Dr. Kwame Owusu', specialty: 'Family medicine', rating: 4.6),
          _ProviderTile(name: 'Nurse Adwoa Boateng', specialty: 'Postpartum care', rating: 4.9),
          _ProviderTile(name: 'Korle Bu Teaching Hospital', specialty: 'Multi-specialty', rating: 4.3),
        ],
      ),
    );
  }
}

class _ProviderTile extends StatelessWidget {
  const _ProviderTile({required this.name, required this.specialty, required this.rating});
  final String name;
  final String specialty;
  final double rating;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Text(name[0])),
        title: Text(name),
        subtitle: Text(specialty),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.star, size: 16, color: Colors.amber),
            const SizedBox(width: 2),
            Text(rating.toStringAsFixed(1)),
          ],
        ),
        onTap: () {},
      ),
    );
  }
}
